# Changelog

All notable changes to this project will be documented in this file.

## [1.0.1] - 2026-06-01
### Fixed
- Player Management: Restored persistence of the selected player (#player-select) across popup open/close cycles, ensuring it is preserved unless disconnected.

### Changed
- Favorites Management: Favorites list is now sorted with the last added item first.
- Build Tooling: Added a Python fallback in `scripts/build.sh` for environments without the `zip` CLI tool.

## [1.0.0] - 2026-04-12
### Added
- Initial release of the LMS Controller Chrome Extension.
- Player Management: View and select active playback devices.
- Transport Controls: Play, pause, skip forward/backward, and view currently playing track with album art.
- Queue & Library Management: Browse queue, library, and favorites.
- Custom App Tab: Quick access to specific LMS apps (designed for Spotty).
- Dynamic optional host permissions for secure configuration.