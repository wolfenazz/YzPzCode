use anyhow::Result;
use std::fs;
use std::path::Path;

use super::validation::validate_no_path_traversal;

pub fn rename_entry(old_path: &str, new_name: &str) -> Result<()> {
    validate_no_path_traversal(old_path)?;
    validate_no_path_traversal(new_name)?;
    let old = Path::new(old_path);
    if !old.exists() {
        return Err(anyhow::anyhow!("Source path does not exist: {}", old_path));
    }
    let parent = old
        .parent()
        .ok_or_else(|| anyhow::anyhow!("No parent directory"))?;
    let new_path = parent.join(new_name);

    if new_path.exists() {
        return Err(anyhow::anyhow!(
            "A file or directory with that name already exists"
        ));
    }

    fs::rename(old, &new_path)?;
    Ok(())
}

pub fn move_entry(source_path: &str, destination_dir: &str) -> Result<()> {
    validate_no_path_traversal(source_path)?;
    validate_no_path_traversal(destination_dir)?;
    let source = Path::new(source_path);
    if !source.exists() {
        return Err(anyhow::anyhow!(
            "Source path does not exist: {}",
            source_path
        ));
    }
    let dest_dir = Path::new(destination_dir);
    if !dest_dir.is_dir() {
        return Err(anyhow::anyhow!(
            "Destination is not a directory: {}",
            destination_dir
        ));
    }
    let file_name = source
        .file_name()
        .ok_or_else(|| anyhow::anyhow!("Invalid source path"))?;
    let dest_path = dest_dir.join(file_name);

    if dest_path.exists() {
        return Err(anyhow::anyhow!(
            "Destination already exists: {}",
            dest_path.display()
        ));
    }

    fs::rename(source, &dest_path)?;
    Ok(())
}

pub fn create_file(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if p.exists() {
        return Err(anyhow::anyhow!("File already exists: {}", path));
    }
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::File::create(p)?;
    Ok(())
}

pub fn create_directory(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if p.exists() {
        return Err(anyhow::anyhow!("Directory already exists: {}", path));
    }
    fs::create_dir_all(p)?;
    Ok(())
}

pub fn delete_entry(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if !p.exists() {
        return Err(anyhow::anyhow!("Path does not exist: {}", path));
    }
    if p.is_dir() {
        fs::remove_dir_all(p)?;
    } else {
        fs::remove_file(p)?;
    }
    Ok(())
}

pub fn reveal_in_file_manager(path: &str) -> Result<()> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    let target = if p.is_file() || !p.exists() {
        p.parent().unwrap_or(p)
    } else {
        p
    };

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(target).spawn()?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(target)
            .spawn()?;
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(target).spawn()?;
    }

    Ok(())
}

pub fn duplicate_entry(path: &str) -> Result<String> {
    validate_no_path_traversal(path)?;
    let p = Path::new(path);
    if !p.exists() {
        return Err(anyhow::anyhow!("Path does not exist: {}", path));
    }

    let parent = p
        .parent()
        .ok_or_else(|| anyhow::anyhow!("No parent directory"))?;

    let stem = p
        .file_stem()
        .ok_or_else(|| anyhow::anyhow!("Invalid file name"))?
        .to_string_lossy()
        .to_string();

    let extension = p.extension().map(|e| format!(".{}", e.to_string_lossy()));

    let mut new_name = format!("{}-copy{}", stem, extension.as_deref().unwrap_or(""));
    let mut new_path = parent.join(&new_name);
    let mut counter = 1;

    while new_path.exists() {
        new_name = format!(
            "{}-copy-{}{}",
            stem,
            counter,
            extension.as_deref().unwrap_or("")
        );
        new_path = parent.join(&new_name);
        counter += 1;
    }

    if p.is_dir() {
        copy_dir_recursive(p, &new_path)?;
    } else {
        fs::copy(p, &new_path)?;
    }

    Ok(new_path.to_string_lossy().to_string())
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

pub fn import_entries(source_paths: &[String], destination_dir: &str) -> Result<Vec<String>> {
    validate_no_path_traversal(destination_dir)?;
    let dest_dir = Path::new(destination_dir);
    if !dest_dir.is_dir() {
        return Err(anyhow::anyhow!(
            "Destination is not a directory: {}",
            destination_dir
        ));
    }

    let mut imported = Vec::new();

    for source_path in source_paths {
        let source = Path::new(source_path);
        if !source.exists() {
            continue;
        }

        let file_name = source
            .file_name()
            .ok_or_else(|| anyhow::anyhow!("Invalid source path: {}", source_path))?;
        let mut dest_path = dest_dir.join(file_name);

        if dest_path.exists() {
            let stem = source
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = source
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()));
            let mut counter = 1;
            loop {
                let new_name = if source.is_dir() {
                    format!("{} ({})", stem, counter)
                } else {
                    format!("{} ({}){}", stem, counter, ext.as_deref().unwrap_or(""))
                };
                dest_path = dest_dir.join(&new_name);
                if !dest_path.exists() {
                    break;
                }
                counter += 1;
            }
        }

        if source.is_dir() {
            copy_dir_recursive(source, &dest_path)?;
        } else {
            fs::copy(source, &dest_path)?;
        }

        imported.push(dest_path.to_string_lossy().to_string());
    }

    Ok(imported)
}
