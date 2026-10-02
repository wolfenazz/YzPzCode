use super::*;

struct Repository {
    directory: PathBuf,
    workspace: String,
    remote: String,
}

impl Repository {
    fn new() -> Self {
        let directory =
            std::env::temp_dir().join(format!("yzpz-git-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).expect("create test directory");
        let workspace = directory.join("workspace").to_string_lossy().to_string();
        let remote = directory.join("remote.git").to_string_lossy().to_string();
        let root = directory.to_string_lossy();
        run_git_hidden(&["init", "-b", "main", &workspace], &root).expect("init repository");
        run_git_hidden(&["init", "--bare", "-b", "main", &remote], &root).expect("init remote");
        let repo = Self {
            directory,
            workspace,
            remote,
        };
        repo.configure(&repo.workspace);
        repo
    }

    fn configure(&self, path: &str) {
        for (key, value) in [
            ("user.name", "Source Control Test"),
            ("user.email", "test@example.invalid"),
            ("commit.gpgsign", "false"),
            ("core.autocrlf", "false"),
            ("core.excludesFile", ""),
            ("core.hooksPath", "missing-test-hooks"),
        ] {
            run_git_hidden(&["config", key, value], path).expect("configure test repository");
        }
    }

    fn git(&self, args: &[&str]) -> String {
        run_git_hidden(args, &self.workspace)
            .unwrap_or_else(|error| panic!("git {args:?}: {error}"))
    }

    fn write(&self, path: &str, text: &str) {
        std::fs::write(Path::new(&self.workspace).join(path), text).expect("write test file");
    }

    fn seed(&self) {
        self.write("file.txt", "initial\n");
        self.git(&["add", "-A"]);
        self.git(&["commit", "-m", "initial"]);
    }

    fn publish(&self, name: &str) {
        self.seed();
        self.git(&["remote", "add", name, &self.remote]);
        git_push(&self.workspace, "main", name, "main").expect("publish branch");
    }

    fn peer_commit(&self) -> String {
        let peer = self.directory.join("peer").to_string_lossy().to_string();
        run_git_hidden(&["clone", &self.remote, &peer], &self.workspace)
            .expect("clone local remote");
        self.configure(&peer);
        std::fs::write(Path::new(&peer).join("peer.txt"), "remote change\n")
            .expect("write peer file");
        run_git_hidden(&["add", "-A"], &peer).expect("stage peer file");
        run_git_hidden(&["commit", "-m", "remote change"], &peer).expect("commit peer file");
        run_git_hidden(&["push", "origin", "main"], &peer).expect("push peer commit");
        run_git_hidden(&["rev-parse", "HEAD"], &peer).expect("peer HEAD")
    }

    fn info(&self) -> GitRemoteInfo {
        git_remote_info(&self.workspace)
            .expect("remote info")
            .expect("remote")
    }
}

impl Drop for Repository {
    fn drop(&mut self) {
        // Only the absolute, uniquely created fixture directory is removed.
        let temp = std::env::temp_dir();
        if self.directory.is_absolute()
            && self.directory.parent() == Some(temp.as_path())
            && self
                .directory
                .file_name()
                .is_some_and(|name| name.to_string_lossy().starts_with("yzpz-git-test-"))
        {
            let _ = std::fs::remove_dir_all(&self.directory);
        }
    }
}

#[test]
fn unborn_branch_is_reported_and_selected_first_commit_works() {
    let repo = Repository::new();
    assert_eq!(git_branches(&repo.workspace).unwrap().current, "main");
    assert!(git_log(&repo.workspace, 20).unwrap().is_empty());
    repo.write("selected.txt", "included\n");
    repo.write("excluded.txt", "excluded\n");
    git_commit(
        &repo.workspace,
        "first\n\nDescription",
        "main",
        Some(&["selected.txt".into()]),
    )
    .unwrap();
    assert_eq!(
        repo.git(&["ls-tree", "--name-only", "HEAD"]).trim(),
        "selected.txt"
    );
    assert_eq!(
        repo.git(&["log", "-1", "--format=%B"]).trim(),
        "first\n\nDescription"
    );
}

#[test]
fn stale_branch_is_rejected_before_staging_or_pushing() {
    let repo = Repository::new();
    repo.publish("origin");
    repo.git(&["switch", "-c", "feature"]);
    repo.write("file.txt", "uncommitted\n");
    let before = repo.git(&["status", "--porcelain=v1"]);
    assert!(git_commit(&repo.workspace, "wrong branch", "main", None)
        .unwrap_err()
        .contains("branch changed"));
    assert_eq!(repo.git(&["status", "--porcelain=v1"]), before);
    assert!(git_push(&repo.workspace, "main", "origin", "main")
        .unwrap_err()
        .contains("branch changed"));
    assert!(run_git_hidden(
        &["rev-parse", "--verify", "refs/heads/feature"],
        &repo.remote
    )
    .is_err());
}

#[test]
fn push_preserves_differently_named_upstream_and_overrides_push_defaults() {
    let repo = Repository::new();
    repo.publish("origin");
    repo.git(&["branch", "-m", "feature"]);
    repo.write("file.txt", "local change\n");
    git_commit(&repo.workspace, "feature commit", "feature", None).unwrap();
    repo.git(&["config", "push.default", "matching"]);
    repo.git(&[
        "config",
        "remote.origin.push",
        "refs/heads/feature:refs/heads/unexpected",
    ]);
    repo.git(&["config", "remote.origin.mirror", "true"]);
    let info = repo.info();
    assert_eq!(info.current_branch, "feature");
    assert_eq!(info.remote_branch, "main");
    assert_eq!((info.ahead, info.behind), (1, 0));
    git_push(&repo.workspace, "feature", "origin", "main").unwrap();
    let remote_head = run_git_hidden(&["rev-parse", "refs/heads/main"], &repo.remote).unwrap();
    assert_eq!(remote_head, repo.git(&["rev-parse", "HEAD"]));
    assert_eq!(
        run_git_hidden(
            &["for-each-ref", "--format=%(refname)", "refs/heads/"],
            &repo.remote
        )
        .unwrap()
        .trim(),
        "refs/heads/main"
    );
    assert_eq!(
        repo.git(&["config", "branch.feature.merge"]).trim(),
        "refs/heads/main"
    );
}

#[test]
fn renamed_remote_is_used_for_fetch_pull_and_push() {
    let repo = Repository::new();
    repo.publish("team");
    assert!(repo.info().has_upstream);
    let peer_head = repo.peer_commit();
    git_fetch(&repo.workspace).unwrap();
    assert_eq!((repo.info().ahead, repo.info().behind), (0, 1));
    git_pull(&repo.workspace, "main", "team", "main").unwrap();
    assert_eq!(repo.git(&["rev-parse", "HEAD"]), peer_head);
    assert_eq!((repo.info().ahead, repo.info().behind), (0, 0));
}

#[test]
fn publishing_new_branch_sets_its_own_upstream() {
    let repo = Repository::new();
    repo.publish("origin");
    repo.git(&["switch", "-c", "feature/new"]);
    assert!(!repo.info().has_upstream);
    git_push(&repo.workspace, "feature/new", "origin", "feature/new").unwrap();
    assert!(repo.info().has_upstream);
    assert_eq!(
        repo.git(&["config", "branch.feature/new.merge"]).trim(),
        "refs/heads/feature/new"
    );
    assert_eq!(
        run_git_hidden(&["rev-parse", "refs/heads/feature/new"], &repo.remote).unwrap(),
        repo.git(&["rev-parse", "HEAD"])
    );
}

#[test]
fn configured_remote_is_used_even_when_origin_exists() {
    let repo = Repository::new();
    repo.publish("team");
    let origin = repo
        .directory
        .join("unused.git")
        .to_string_lossy()
        .to_string();
    run_git_hidden(&["init", "--bare", &origin], &repo.workspace).unwrap();
    repo.git(&["remote", "add", "origin", &origin]);
    assert_eq!(repo.info().name, "team");
    repo.write("file.txt", "team change\n");
    git_commit(&repo.workspace, "team commit", "main", None).unwrap();
    git_push(&repo.workspace, "main", "team", "main").unwrap();
    assert!(run_git_hidden(&["rev-parse", "--verify", "refs/heads/main"], &origin).is_err());
}

#[test]
fn changed_upstream_is_rejected_instead_of_redirecting_push() {
    let repo = Repository::new();
    repo.publish("origin");
    repo.git(&["config", "branch.main.merge", "refs/heads/other"]);
    assert!(git_push(&repo.workspace, "main", "origin", "main")
        .unwrap_err()
        .contains("destination changed"));
    assert!(run_git_hidden(&["rev-parse", "--verify", "refs/heads/other"], &repo.remote).is_err());
}

#[test]
fn divergent_pull_does_not_create_merge_or_rebase() {
    let repo = Repository::new();
    repo.publish("origin");
    repo.peer_commit();
    repo.write("file.txt", "local change\n");
    git_commit(&repo.workspace, "local commit", "main", None).unwrap();
    repo.git(&["config", "pull.rebase", "true"]);
    let before = repo.git(&["rev-parse", "HEAD"]);
    assert!(git_pull(&repo.workspace, "main", "origin", "main").is_err());
    assert_eq!(repo.git(&["rev-parse", "HEAD"]), before);
    assert_eq!((repo.info().ahead, repo.info().behind), (1, 1));
    assert!(repo.git(&["status", "--porcelain=v1"]).is_empty());
}

#[test]
fn selected_commit_excludes_other_staged_files_and_handles_literal_paths() {
    let repo = Repository::new();
    repo.seed();
    repo.write("selected[1].txt", "included\n");
    repo.write("selected1.txt", "excluded wildcard match\n");
    repo.write("excluded.txt", "staged separately\n");
    repo.git(&["add", "excluded.txt"]);
    std::fs::remove_file(Path::new(&repo.workspace).join("file.txt")).unwrap();
    let selected = Path::new(&repo.workspace)
        .join("selected[1].txt")
        .to_string_lossy()
        .to_string();
    git_commit(
        &repo.workspace,
        "selected changes",
        "main",
        Some(&[selected, "file.txt".into()]),
    )
    .unwrap();
    assert_eq!(
        repo.git(&["ls-tree", "--name-only", "HEAD"]).trim(),
        "selected[1].txt"
    );
    assert_eq!(
        repo.git(&["diff", "--cached", "--name-only"]).trim(),
        "excluded.txt"
    );
}

#[test]
fn empty_selection_and_outside_paths_do_not_stage_anything() {
    let repo = Repository::new();
    repo.seed();
    repo.write("file.txt", "pending\n");
    assert!(git_commit(&repo.workspace, "empty", "main", Some(&[])).is_err());
    assert!(git_commit(
        &repo.workspace,
        "outside",
        "main",
        Some(&["../outside.txt".into()])
    )
    .is_err());
    assert!(repo.git(&["diff", "--cached"]).is_empty());
}

#[test]
fn detached_head_cannot_commit_or_push() {
    let repo = Repository::new();
    repo.publish("origin");
    repo.git(&["switch", "--detach", "HEAD"]);
    repo.write("file.txt", "pending\n");
    assert_eq!(git_branches(&repo.workspace).unwrap().current, "HEAD");
    assert!(git_commit(&repo.workspace, "detached", "HEAD", None)
        .unwrap_err()
        .contains("Detached HEAD"));
    assert!(git_push(&repo.workspace, "HEAD", "origin", "main")
        .unwrap_err()
        .contains("Detached HEAD"));
    assert!(repo.git(&["diff", "--cached"]).is_empty());
}

#[test]
fn staged_diff_compares_to_head_and_discard_restores_both_index_and_file() {
    let repo = Repository::new();
    repo.seed();
    repo.write("file.txt", "staged version\n");
    repo.git(&["add", "file.txt"]);
    let diff = git_file_diff(&repo.workspace, "file.txt").unwrap();
    assert!(diff.diff.contains("-initial"));
    assert!(diff.diff.contains("+staged version"));
    repo.write("file.txt", "unstaged version\n");
    git_discard_file(&repo.workspace, "file.txt").unwrap();
    assert_eq!(
        std::fs::read_to_string(Path::new(&repo.workspace).join("file.txt")).unwrap(),
        "initial\n"
    );
    assert!(repo.git(&["status", "--porcelain=v1"]).is_empty());
    repo.write("added.txt", "new staged file\n");
    repo.git(&["add", "added.txt"]);
    git_discard_file(&repo.workspace, "added.txt").unwrap();
    assert!(repo.git(&["status", "--porcelain=v1"]).is_empty());
}

#[test]
fn checkout_checks_expected_branch_and_never_detaches_on_tags() {
    let repo = Repository::new();
    repo.seed();
    repo.git(&["branch", "feature"]);
    repo.git(&["tag", "release"]);
    assert!(git_checkout(&repo.workspace, "release", "main").is_err());
    git_checkout(&repo.workspace, "feature", "main").unwrap();
    assert!(git_checkout(&repo.workspace, "main", "main").is_err());
    assert_eq!(git_branches(&repo.workspace).unwrap().current, "feature");
}

#[test]
fn workspace_subdirectory_uses_repository_paths_for_status_diff_and_commit() {
    let repo = Repository::new();
    repo.seed();
    let subdirectory = Path::new(&repo.workspace).join("app");
    std::fs::create_dir(&subdirectory).unwrap();
    std::fs::write(subdirectory.join("selected.ts"), "new code\n").unwrap();
    repo.write("file.txt", "other change\n");
    let cwd = subdirectory.to_string_lossy();
    let statuses = super::super::git_status::get_git_status(&cwd).unwrap();
    assert_eq!(statuses.len(), 2);
    let selected = statuses
        .iter()
        .find(|file| file.path.ends_with("selected.ts"))
        .unwrap();
    assert!(git_file_diff(&cwd, &selected.path)
        .unwrap()
        .current
        .contains("new code"));
    git_commit(
        &cwd,
        "subdirectory commit",
        "main",
        Some(std::slice::from_ref(&selected.path)),
    )
    .unwrap();
    assert_eq!(
        repo.git(&["show", "HEAD:app/selected.ts"]).trim(),
        "new code"
    );
    assert_eq!(repo.git(&["show", "HEAD:file.txt"]).trim(), "initial");
}
