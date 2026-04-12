# Privacy Policy for LMS Controller

**Effective Date:** April 12, 2026

This Privacy Policy describes how the LMS Controller Chrome Extension ("the Extension") handles your data.

## 1. Data Collection and Usage
The Extension is designed to act as a remote control for your self-hosted Lyrion Media Server (LMS). 
- **No Personal Data Collection:** The Extension does not collect, store, or transmit any personal information, browsing history, or usage analytics to the developer or any third parties.
- **Local Storage:** The Extension stores your configured LMS Server URL and your preferences (such as the last selected player and custom app tab settings) locally on your device using the Chrome Storage API. This data is never transmitted outside of your local machine, except directly to your configured LMS server.

## 2. Permissions Explained
The Extension requests the following permissions to function:
- **`storage`**: Used to save your LMS Server URL and UI preferences locally.
- **Optional Host Permissions (`http://*/*` and `https://*/*`)**: Because Lyrion Media Server is self-hosted, it can reside on any local IP address (e.g., `192.168.1.x`), custom local domain (e.g., `http://lms.local`), or remote server. The Extension requests these permissions dynamically *only* for the specific URL you provide in the Options page. This allows the Extension to send HTTP JSON-RPC commands to your server. The Extension does not read, modify, or interact with any other websites you visit.

## 3. Third-Party Services
The Extension does not integrate with any third-party analytics, tracking, or advertising services.

## 4. Open Source
The Extension is open-source. You can review the entire source code to verify its behavior at:
[https://github.com/ludoo/chrome-lms-extension](https://github.com/ludoo/chrome-lms-extension)

## 5. Changes to this Policy
If any changes are made to how the Extension handles data, this Privacy Policy will be updated accordingly.

## 6. Contact
If you have any questions or concerns about this Privacy Policy, please open an issue on the GitHub repository.