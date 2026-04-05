import { invoke } from '@tauri-apps/api/core';
import { FileEntry } from '../types';

export interface ProjectActions {
  devCmd: string | null;
  buildCmd: string | null;
  label: string;
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const detectCache = new Map<string, ProjectActions | null>();

export function invalidateProjectCache(cwd: string): void {
  detectCache.delete(cwd);
}

export async function detectProject(cwd: string): Promise<ProjectActions | null> {
  const cached = detectCache.get(cwd);
  if (cached !== undefined) return cached;

  const result = await doDetect(cwd);
  detectCache.set(cwd, result);
  return result;
}

async function doDetect(cwd: string): Promise<ProjectActions | null> {
  let entries: FileEntry[];
  try {
    entries = await invoke<FileEntry[]>('list_directory_entries', { path: cwd });
  } catch {
    return null;
  }

  const names = new Set(entries.map((e) => e.name));
  const hasPackageJson = names.has('package.json');
  const hasCargoToml = names.has('Cargo.toml');
  const hasTauriConf =
    names.has('tauri.conf.json') ||
    entries.some((e) => e.name === 'src-tauri' && e.isDir);

  if (hasPackageJson) {
    return detectNodeProject(cwd, names, entries);
  }

  if (hasCargoToml) {
    if (hasTauriConf) {
      return {
        devCmd: 'npm run tauri dev',
        buildCmd: 'npm run tauri build',
        label: 'Tauri',
      };
    }
    return {
      devCmd: 'cargo run',
      buildCmd: 'cargo build',
      label: 'Rust',
    };
  }

  if (names.has('go.mod')) {
    return {
      devCmd: 'go run .',
      buildCmd: 'go build',
      label: 'Go',
    };
  }

  if (names.has('pubspec.yaml')) {
    return {
      devCmd: 'flutter run',
      buildCmd: 'flutter build',
      label: 'Flutter',
    };
  }

  if (names.has('pyproject.toml') || names.has('requirements.txt')) {
    return {
      devCmd: 'python main.py',
      buildCmd: null,
      label: 'Python',
    };
  }

  if (entries.some((e) => e.name.endsWith('.sln') || e.name.endsWith('.csproj'))) {
    return {
      devCmd: 'dotnet run',
      buildCmd: 'dotnet build',
      label: '.NET',
    };
  }

  if (names.has('Gemfile')) {
    return {
      devCmd: 'rails server',
      buildCmd: null,
      label: 'Rails',
    };
  }

  if (names.has('composer.json')) {
    return {
      devCmd: 'php artisan serve',
      buildCmd: null,
      label: 'PHP',
    };
  }

  if (names.has('Makefile')) {
    return {
      devCmd: 'make run',
      buildCmd: 'make',
      label: 'Make',
    };
  }

  return null;
}

async function detectNodeProject(
  cwd: string,
  names: Set<string>,
  entries: FileEntry[],
): Promise<ProjectActions | null> {
  let pkg: PackageJson | null = null;
  try {
    const content = await invoke<{ content: string; language: string }>(
      'read_file_content',
      { path: `${cwd}/package.json` },
    );
    pkg = JSON.parse(content.content) as PackageJson;
  } catch {
    return null;
  }

  const scripts = pkg.scripts || {};
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

  const hasDev =
    'dev' in scripts ||
    'serve' in scripts ||
    'start' in scripts;
  const hasBuild = 'build' in scripts;

  if (!hasDev && !hasBuild) return null;

  let devCmd: string | null = null;
  if ('dev' in scripts) devCmd = 'npm run dev';
  else if ('serve' in scripts) devCmd = 'npm run serve';
  else if ('start' in scripts) devCmd = 'npm start';

  let buildCmd: string | null = null;
  if (hasBuild) buildCmd = 'npm run build';

  const fileNames = new Set([...names, ...entries.map((e) => e.name)]);
  let label = 'Node';

  if (deps['next'] || fileNames.has('next.config.js') || fileNames.has('next.config.mjs') || fileNames.has('next.config.ts')) {
    label = 'Next.js';
  } else if (deps['nuxt'] || fileNames.has('nuxt.config.ts') || fileNames.has('nuxt.config.js')) {
    label = 'Nuxt';
  } else if (deps['@remix-run/react'] || fileNames.has('remix.config.js')) {
    label = 'Remix';
  } else if (deps['@angular/core']) {
    label = 'Angular';
  } else if (deps['vue']) {
    label = 'Vue';
  } else if (deps['svelte'] || deps['@sveltejs/kit']) {
    label = 'SvelteKit';
  } else if (deps['react']) {
    label = 'React';
  } else if (deps['vite'] || deps['@vitejs/plugin-react'] || fileNames.has('vite.config.ts') || fileNames.has('vite.config.js')) {
    label = 'Vite';
  } else if (deps['express']) {
    label = 'Express';
  } else if (deps['@nestjs/core']) {
    label = 'NestJS';
  } else if (deps['fastify']) {
    label = 'Fastify';
  } else if (deps['expo'] || deps['expo-router']) {
    label = 'Expo';
  } else if (deps['@react-native-community/cli']) {
    label = 'React Native';
  }

  return { devCmd, buildCmd, label };
}
