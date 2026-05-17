# games

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux

# Linux AppImage only (recommended for Bazzite)
$ npm run build:linux:appimage

# Linux RPM only
$ npm run build:linux:rpm
```

## Bazzite Linux Compatibility

Bazzite is Fedora-based, so the most compatible outputs are:

- AppImage (portable, no install required)
- RPM (native Fedora package)

Artifacts are generated in `dist/`.

### Run AppImage on Bazzite

```bash
$ chmod +x dist/games-*-x64.AppImage
$ ./dist/games-*-x64.AppImage
```

If AppImage does not run, install `appimage-run` and try again.

### Install RPM on Bazzite

On immutable Fedora variants (including Bazzite), install with rpm-ostree:

```bash
$ sudo rpm-ostree install dist/games-*.rpm
$ systemctl reboot
```

## Linux Build Notes

- AppImage packaging on Windows can fail without symlink permission.
- RPM packaging requires `fpm` (typically available on Linux build environments, not plain Windows).

Most reliable workflow for Linux artifacts:

1. Build on Linux directly (recommended on Bazzite/Fedora).
2. Or use a Linux environment (WSL2/container/CI) for Linux packaging.

Example on Bazzite/Fedora:

```bash
$ npm install
$ npm run build:linux:appimage
$ npm run build:linux:rpm
```
