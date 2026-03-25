# Auto-Update Guide for YzPzCode (Tauri v2)

This guide explains how to set up automatic updates for your Tauri application using GitHub Releases.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Step 1: Generate Signing Keys](#step-1-generate-signing-keys)
4. [Step 2: Configure Tauri](#step-2-configure-tauri)
5. [Step 3: Frontend Integration](#step-3-frontend-integration)
6. [Step 4: GitHub Actions Workflow](#step-4-github-actions-workflow)
7. [Step 5: Create GitHub Release](#step-5-create-github-release)
8. [Testing Updates](#testing-updates)

---

## Overview

Tauri's updater works by:
1. Checking a remote endpoint for the latest version
2. Comparing with the installed version
3. Downloading the new installer from GitHub Releases
4. Verifying the signature
5. Installing the update

---

## Prerequisites

- A GitHub repository for your app
- GitHub Actions enabled
- Signing keys (for security)

---

## Step 1: Generate Signing Keys

Run this command to generate a keypair for signing updates:

```bash
npm run tauri signer generate -- -w ~/.tauri/yzpzcode.key
```

Or on Windows:
```bash
npm run tauri signer generate -- -w %USERPROFILE%\.tauri\yzpzcode.key
```

This will output:
- **Private key**: Saved to the file you specified
- **Public key**: Printed to console (you'll need this for tauri.conf.json)

### Store Keys Securely

Add to GitHub Secrets (Settings → Secrets and variables → Actions):

| Secret Name | Value |
|-------------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Content of your private key file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password you set during key generation |

---

## Step 2: Configure Tauri

### Update `tauri.conf.json`

Add the updater configuration to `app/src-tauri/tauri.conf.json`:

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "YOUR_PUBLIC_KEY_HERE",
      "endpoints": [
        "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/{{target}}-{{arch}}.json"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

Replace:
- `YOUR_PUBLIC_KEY_HERE` - The public key from Step 1
- `YOUR_USERNAME` - Your GitHub username
- `YOUR_REPO` - Your repository name

### Install Updater Plugin

```bash
cd app
npm install @tauri-apps/plugin-updater
```

### Register Plugin in Rust

Update `app/src-tauri/src/lib.rs`:

```rust
fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        // ... other plugins
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Add to `app/src-tauri/Cargo.toml`:

```toml
[dependencies]
tauri-plugin-updater = "2"
```

---

## Step 3: Frontend Integration

### Create Update Checker Hook

Create `app/src/hooks/useUpdater.ts`:

```typescript
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { useState, useCallback } from 'react';

interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: Date;
  body?: string;
}

export function useUpdater() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setError(null);
    
    try {
      const update = await check();
      
      if (update) {
        setUpdateAvailable({
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body,
        });
        return update;
      }
      
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check for updates');
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    const update = await check();
    
    if (!update) {
      setError('No update available');
      return;
    }

    setDownloading(true);
    setDownloadProgress(0);

    try {
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setDownloadProgress(0);
            break;
          case 'Progress':
            const progress = (event.data.chunkLength / event.data.contentLength) * 100;
            setDownloadProgress(Math.round(progress));
            break;
          case 'Finished':
            setDownloadProgress(100);
            break;
        }
      });

      await relaunch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install update');
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    error,
    checkForUpdates,
    downloadAndInstall,
  };
}
```

### Add Update Notification Component

Create `app/src/components/common/UpdateNotification.tsx`:

```tsx
import React from 'react';
import { useUpdater } from '../../hooks/useUpdater';

export const UpdateNotification: React.FC = () => {
  const {
    checking,
    downloading,
    downloadProgress,
    updateAvailable,
    error,
    checkForUpdates,
    downloadAndInstall,
  } = useUpdater();

  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  if (!updateAvailable || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm bg-theme-card border border-theme rounded-lg shadow-lg p-4">
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        
        <div className="flex-1">
          <h4 className="text-sm font-medium text-theme-main">
            Update Available
          </h4>
          <p className="text-xs text-theme-secondary mt-1">
            Version {updateAvailable.version} is available (current: {updateAvailable.currentVersion})
          </p>
          
          {downloading && (
            <div className="mt-2">
              <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${downloadProgress}%` }}
                />
              </div>
              <p className="text-xs text-theme-secondary mt-1">
                Downloading... {downloadProgress}%
              </p>
            </div>
          )}
          
          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
          
          <div className="flex gap-2 mt-3">
            <button
              onClick={downloadAndInstall}
              disabled={downloading}
              className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50"
            >
              {downloading ? 'Updating...' : 'Update Now'}
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 text-xs text-theme-secondary hover:text-theme-main transition-colors"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### Add to Your App

In `App.tsx` or your main layout:

```tsx
import { UpdateNotification } from './components/common/UpdateNotification';

// In your JSX:
<UpdateNotification />
```

---

## Step 4: GitHub Actions Workflow

Create `.github/workflows/release.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

env:
  CARGO_TERM_COLOR: always

jobs:
  create-release:
    runs-on: ubuntu-latest
    outputs:
      release_id: ${{ steps.create-release.outputs.id }}
    steps:
      - uses: actions/checkout@v4
      
      - name: Create Release
        id: create-release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ github.ref_name }}
          name: YzPzCode ${{ github.ref_name }}
          body: |
            ## What's Changed
            
            <!-- Add your release notes here -->
            
            **Full Changelog**: https://github.com/${{ github.repository }}/compare/${{ github.event.before }}...${{ github.ref_name }}
          draft: true
          prerelease: false

  build:
    needs: create-release
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            target: 'aarch64-apple-darwin'
          - platform: 'macos-latest'
            target: 'x86_64-apple-darwin'
          - platform: 'ubuntu-22.04'
            target: 'x86_64-unknown-linux-gnu'
          - platform: 'windows-latest'
            target: 'x86_64-pc-windows-msvc'

    runs-on: ${{ matrix.platform }}
    
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Rust
        uses: dtolnay/rust-action@stable
        with:
          targets: ${{ matrix.target }}

      - name: Install dependencies (Ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev

      - name: Install frontend dependencies
        working-directory: app
        run: npm ci

      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: app
          tagName: ${{ github.ref_name }}
          releaseId: ${{ needs.create-release.outputs.release_id }}
          releaseBody: 'See the release notes'
          releaseDraft: true
          prerelease: false
          args: --target ${{ matrix.target }}

  publish-release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Publish Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: ${{ github.ref_name }}
          draft: false
```

---

## Step 5: Create GitHub Release

### Option A: Using Git Tags (Recommended)

```bash
# Update version in package.json and tauri.conf.json first
# Then create and push a tag:
git tag v1.0.1
git push origin v1.0.1
```

This will trigger the GitHub Actions workflow automatically.

### Option B: Manual Release

1. Go to your repository on GitHub
2. Click "Releases" → "Draft a new release"
3. Click "Choose a tag" and create a new tag (e.g., `v1.0.1`)
4. Fill in the release title and notes
5. Upload the built installers manually
6. Click "Publish release"

---

## Testing Updates

### Local Testing

1. Build your app with a lower version (e.g., `0.1.0`)
2. Install it on your machine
3. Update the version to `0.1.1` in both:
   - `app/package.json`
   - `app/src-tauri/tauri.conf.json`
4. Build and create a release
5. Open the installed app and verify it detects the update

### Verify Update JSON

After releasing, verify the update JSON is accessible:

```
https://github.com/YOUR_USERNAME/YOUR_REPO/releases/latest/download/x86_64-pc-windows-msvc.json
```

It should look like:

```json
{
  "version": "1.0.1",
  "notes": "Release notes here",
  "pub_date": "2024-01-15T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK...",
      "url": "https://github.com/YOUR_USERNAME/YOUR_REPO/releases/download/v1.0.1/YzPzCode_1.0.1_x64-setup.exe"
    }
  }
}
```

---

## Troubleshooting

### Update not detected

- Verify the endpoint URL is correct
- Check that the version in the JSON is higher than installed
- Ensure signature matches

### Signature verification failed

- Make sure you're using the same private key for signing
- Verify the public key in `tauri.conf.json` matches

### Windows SmartScreen warning

- Sign your executable with a code signing certificate
- Build reputation over time with many downloads

---

## Additional Resources

- [Tauri Updater Documentation](https://v2.tauri.app/plugin/updater/)
- [Tauri GitHub Action](https://github.com/tauri-apps/tauri-action)
- [Code Signing for Windows](https://v2.tauri.app/distribute/sign/)
