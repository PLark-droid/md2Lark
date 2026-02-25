# md2Lark Privacy Policy

**Last updated:** 2026-02-25

## Overview

md2Lark is a Chrome extension that converts Markdown text to Lark-optimized HTML format. Your privacy is important to us.

## Data Collection

**md2Lark does not collect, transmit, or store any personal data on external servers.**

All processing happens entirely within your browser:

- Markdown conversion is performed locally using JavaScript
- No data is sent to any external API or server
- No analytics or tracking scripts are included
- No cookies are set

## Local Storage

md2Lark uses Chrome's built-in storage APIs for the following purposes only:

- **chrome.storage.sync**: Stores your extension settings (style preferences, GFM toggle, etc.) and syncs them across your Chrome devices via your Google account
- **chrome.storage.local**: Stores your conversion history (up to 50 entries) locally on your device

This data never leaves Chrome's storage system and is not accessible to md2Lark's developers or any third party.

## Permissions

md2Lark requests the following Chrome permissions:

| Permission | Purpose |
|-----------|---------|
| `clipboardWrite` | Write converted HTML to your clipboard |
| `activeTab` | Read selected text from the current tab for conversion |
| `scripting` | Inject content scripts for keyboard shortcut conversion and AI page fetching |
| `storage` | Save your settings and conversion history |

### Host Permissions

md2Lark requests access to the following sites:

| Site | Purpose |
|------|---------|
| `claude.ai` | Extract AI-generated text for conversion (Fetch from AI feature) |
| `chatgpt.com` | Extract AI-generated text for conversion (Fetch from AI feature) |
| `chat.openai.com` | Extract AI-generated text for conversion (Fetch from AI feature) |

These permissions are only used when you explicitly click the "Fetch from AI" button. md2Lark does not automatically read or monitor these pages.

## Open Source

md2Lark is open source. You can review the complete source code at:
https://github.com/PLark-droid/md2Lark

## Contact

For questions or concerns about this privacy policy, please open an issue on our GitHub repository.

## Changes

We may update this privacy policy from time to time. Changes will be posted in the GitHub repository.
