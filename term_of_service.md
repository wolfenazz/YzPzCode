# Terms of Service

**YzPzCode Desktop Application**

**Effective Date: April 6, 2026 | Version 1.6.4**

---

## Table of Contents

1. [Acceptance of Terms](#1-acceptance-of-terms)
2. [Description of Service](#2-description-of-service)
3. [License Grant](#3-license-grant)
4. [Third-Party Services](#4-third-party-services)
5. [User Responsibilities](#5-user-responsibilities)
6. [Data Collection & Privacy](#6-data-collection--privacy)
7. [Intellectual Property](#7-intellectual-property)
8. [Disclaimer of Warranties](#8-disclaimer-of-warranties)
9. [Limitation of Liability](#9-limitation-of-liability)
10. [Indemnification](#10-indemnification)
11. [Terminal & File System Access](#11-terminal--file-system-access)
12. [Feedback](#12-feedback)
13. [Updates](#13-updates)
14. [Termination](#14-termination)
15. [Changes to Terms](#15-changes-to-terms)
16. [Governing Law](#16-governing-law)
17. [Contact Information](#17-contact-information)

---

## 1. Acceptance of Terms

By downloading, installing, or using the YzPzCode desktop application ("Software"), you ("User," "you," or "your") agree to be bound by these Terms of Service ("Terms"). If you do not agree to all of these Terms, do not install or use the Software.

These Terms constitute a legally binding agreement between you and the YzPzCode developer ("Developer," "we," "us," or "our"). By using the Software, you confirm that you have read, understood, and agree to be bound by these Terms in their entirety.

If you are using the Software on behalf of an organization, you represent and warrant that you have the authority to bind that organization to these Terms.

---

## 2. Description of Service

### 2.1 Overview

YzPzCode (identifier: `com.yzpzcode.desktop`) is a cross-platform desktop application built with Tauri v2 (Rust backend and React 19 frontend) designed for managing multiple AI CLI coding tools within a unified workspace environment. The Software is available for Windows, macOS, and Linux.

### 2.2 Core Features

The Software provides the following functionality:

- **AI CLI Tool Orchestration** — Detection, installation, launching, and management of third-party AI CLI tools, including but not limited to Claude Code (Anthropic), Codex CLI (OpenAI), Antigravity CLI (Google), OpenCode (AnomalyCo), Cursor CLI (Cursor), and Kilo CLI (Kilo). YzPzCode does not provide AI capabilities itself; it acts solely as a management and integration layer.
- **Terminal Management** — Creation of pseudo-terminal (PTY) sessions with configurable grid layouts, enabling simultaneous terminal operations. All terminal I/O is local to your machine.
- **File System Access** — Full file operations including read, write, create, delete, rename, move, duplicate, and import, subject to your operating system's permission model.
- **Git Integration** — Local Git operations including status checks, diffs, staging, and file content retrieval.
- **IDE Detection & Launching** — Automatic detection of installed development environments and the ability to launch them from within the Software.
- **Agent Task Execution** — Acceptance of natural language prompts that are forwarded to third-party AI CLI binaries to generate shell commands, which are then written into terminal sessions.
- **Built-in Code Editor** — A CodeMirror 6-based editor with multi-language support, file previews (PDF, DOCX, XLSX, images), search/replace functionality, and a minimap.
- **Feedback System** — A voluntary feedback mechanism for submitting comments, suggestions, and issue reports.
- **Auto-Update System** — Periodic checks for software updates via GitHub Releases, with optional automatic downloading.
- **Environment Setup** — Reading and caching of user environment variables to facilitate CLI tool discovery and execution.

### 2.3 Important Clarification

YzPzCode is a **management and integration tool**. It does not provide, host, or operate any artificial intelligence, machine learning, or language model services. All AI-related functionality is provided by third-party CLI tools that you install and configure independently.

---

## 3. License Grant

### 3.1 License

Subject to your compliance with these Terms, the Developer grants you a limited, non-exclusive, non-transferable, revocable license to download, install, and use the Software on your personal devices for personal or commercial development purposes.

### 3.2 Restrictions

You agree **not to**:

- Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code of the Software, except to the extent that such activity is expressly permitted by applicable law notwithstanding this limitation.
- Modify, adapt, alter, translate, or create derivative works of the Software.
- Sublicense, lease, lend, loan, distribute, or otherwise transfer the Software to any third party.
- Use the Software for any unlawful purpose or in any manner that violates these Terms.
- Remove, alter, or obscure any proprietary notices, labels, or marks on the Software.
- Use the Software to develop a competing product or service.
- Bypass, disable, or circumvent any security or access control mechanism of the Software.

### 3.3 Open Source Components

The Software may incorporate or rely upon open source software components. Such components are governed by their respective licenses, which are included with the Software or available upon request. To the extent that any open source license requires that certain rights be provided to you, such rights take precedence over any conflicting restrictions in these Terms.

---

## 4. Third-Party Services

### 4.1 AI CLI Tools

YzPzCode integrates with and manages the following third-party AI CLI tools, each of which is governed by its own terms of service, privacy policy, and license agreement:

| Tool | Provider | Policies |
|------|----------|----------|
| Claude Code | Anthropic | https://www.anthropic.com/policies |
| Codex CLI | OpenAI | https://openai.com/policies |
| Antigravity CLI | Google | https://policies.google.com |
| OpenCode | AnomalyCo | https://opencode.ai/docs |
| Cursor CLI | Cursor | https://cursor.com/terms |
| Kilo CLI | Kilo | https://kilocode.ai/docs |

### 4.2 Disclaimer Regarding Third-Party Services

- The Developer does **not** operate, control, or endorse any of the third-party AI CLI tools or their associated services.
- Your use of any third-party AI CLI tool is subject to that tool's own terms of service and privacy policy. You are solely responsible for reviewing and complying with those terms.
- The Developer is **not responsible** for the content, accuracy, safety, legality, or any other aspect of outputs generated by third-party AI tools.
- The Developer is **not liable** for any damage, loss, or harm arising from your use of third-party AI CLI tools, including but not limited to incorrect code generation, data loss, security vulnerabilities, or any actions taken based on AI-generated suggestions.
- The availability, functionality, pricing, and terms of third-party AI CLI tools may change at any time without notice from the Developer.
- Any API keys, credentials, or account information used by third-party CLI tools are managed entirely by you and the respective third-party provider. The Developer does not access, store, or transmit your API keys or credentials to third-party AI services.

### 4.3 Other Third-Party Services

The Software interacts with the following third-party services:

- **GitHub Releases API** — Used for checking and downloading software updates. Subject to GitHub's Terms of Service at https://docs.github.com/en/site-policy.
- **Discord Webhooks** — Used exclusively for submitting voluntary user feedback. Subject to Discord's Terms of Service at https://discord.com/terms.
- **CLI Install Endpoints** — Used for downloading third-party CLI installers when you initiate an installation. Subject to each provider's respective terms.

---

## 5. User Responsibilities

### 5.1 General Responsibilities

By using the Software, you acknowledge and agree that you are responsible for:

- Ensuring your system meets the technical requirements for running the Software and any third-party CLI tools you choose to install.
- Maintaining the security of your computer, files, and environment, including any API keys, credentials, or sensitive data accessible through the Software.
- All actions performed through the Software, including commands executed in terminal sessions, file operations, and any code or content generated through AI CLI tools.
- Complying with all applicable local, state, national, and international laws and regulations in your use of the Software.
- Maintaining up-to-date antivirus and security software on your system.
- Regularly backing up your data and files.

### 5.2 Acceptable Use

You agree to use the Software only for lawful purposes and in accordance with these Terms. You agree **not to**:

- Use the Software to develop, test, or deploy malicious software, including but not limited to malware, ransomware, spyware, or any code designed to exploit vulnerabilities.
- Use the Software to gain unauthorized access to systems, networks, or data.
- Use the Software to violate the intellectual property rights of others.
- Use the Software to generate, store, or distribute content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable.
- Interfere with or disrupt the integrity or performance of the Software.
- Attempt to gain unauthorized access to any portions of the Software, other accounts, computer systems, or networks connected to the Software.

### 5.3 Third-Party Tool Compliance

You are solely responsible for:

- Obtaining and maintaining any licenses, subscriptions, or API keys required by third-party AI CLI tools.
- Complying with the rate limits, usage policies, and terms of service of each third-party AI CLI tool you use.
- Any charges, fees, or costs incurred through your use of third-party AI CLI tools.
- Monitoring and managing your usage of third-party AI services to avoid unexpected costs.

---

## 6. Data Collection & Privacy

### 6.1 Data We Collect

The Developer is committed to transparency regarding data collection. The following describes all data handling practices of the Software:

**Data NOT Collected:**

- No user account or registration is required.
- No telemetry or analytics data is collected. The Software does not include any tracking SDK or analytics framework.
- No crash reports are transmitted to external services.
- No AI API calls are made directly by the Software. All AI interactions occur through third-party CLI tools you install.

**Data Stored Locally:**

- **User preferences and settings** — Stored in your browser/Tauri local storage. This includes theme preferences, workspace configurations, layout settings, and other application preferences.
- **Environment variable cache** — Your system environment variables (PATH, HOME, etc.) are read and cached locally for up to 24 hours to facilitate CLI tool discovery and execution. This cache is stored on your local filesystem only.
- **Workspace state** — Optional workspace state saving (toggled by user preference) that preserves your terminal layout, open files, and session configuration.

**Data That May Be Transmitted:**

- **Feedback submissions** — When you voluntarily submit feedback through the built-in feedback form, the following data is transmitted via Discord webhook:
  - Your feedback message
  - An optional display name (if you choose to provide one)
  - Optional contact information (if you choose to provide it)
  - A timestamp of the submission
- **Update checks** — The Software periodically contacts the GitHub Releases API to check for available updates. This involves standard HTTP requests to GitHub's public API.

### 6.2 API Key and Credential Detection

The Software may check for the **existence** of credential files and environment variables to determine whether third-party AI CLI tools are properly configured. The Software:

- Only checks whether these files or variables **exist**.
- Does **not** read, store, or transmit the **values** of API keys, tokens, or other credentials.
- Does **not** send your credentials to any server or third-party service.

### 6.3 Third-Party Data Practices

The Developer has no control over, and is not responsible for, the data collection practices of third-party AI CLI tools, GitHub, Discord, or any other third-party service you interact with through the Software. You should review each third-party service's privacy policy independently:

- **Anthropic:** https://www.anthropic.com/privacy
- **OpenAI:** https://openai.com/privacy
- **Google:** https://policies.google.com/privacy
- **Discord:** https://discord.com/privacy
- **GitHub:** https://docs.github.com/en/site-policy/privacy-policies

### 6.4 Data Security

The Developer takes reasonable measures to ensure the security of the Software. However:

- No method of electronic transmission or storage is 100% secure.
- The Developer cannot guarantee the absolute security of any data stored locally on your device.
- You are responsible for implementing appropriate security measures on your own device.

---

## 7. Intellectual Property

### 7.1 Ownership

The Software, including but not limited to its source code, object code, graphics, user interface, documentation, and all associated materials, is the exclusive property of the Developer and is protected by applicable copyright, trademark, and other intellectual property laws.

### 7.2 Reserved Rights

All rights not expressly granted to you in these Terms are reserved by the Developer. The Developer retains all right, title, and interest in and to the Software, including all intellectual property rights therein.

### 7.3 Feedback and Contributions

Any feedback, suggestions, or ideas you provide regarding the Software (whether through the built-in feedback system or otherwise) may be used by the Developer without any obligation of compensation, attribution, or confidentiality to you. See [Section 12 (Feedback)](#12-feedback) for further details.

### 7.4 Trademarks

YzPzCode and any product or service names, logos, or slogans used in the Software are trademarks of the Developer. You may not use any Developer trademarks without prior written permission. All third-party trademarks referenced in the Software are the property of their respective owners.

---

## 8. Disclaimer of Warranties

### 8.1 As-Is Basis

THE SOFTWARE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE. TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, THE DEVELOPER DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:

- **Implied warranties of merchantability** — The Software is not warranted to be error-free, uninterrupted, or commercially viable for any particular purpose.
- **Implied warranties of fitness for a particular purpose** — The Developer does not warrant that the Software will meet your specific requirements or expectations.
- **Implied warranties of non-infringement** — The Developer does not warrant that the use of the Software will not infringe on the rights of third parties.
- **Warranties of title** — The Developer does not warrant that it has perfect title to all elements of the Software.

### 8.2 No Guarantee of Results

The Developer does not warrant or guarantee that:

- The Software will function without errors, bugs, or interruptions.
- The Software will be compatible with all system configurations, operating system versions, or third-party CLI tools.
- The results obtained from the use of the Software or any integrated third-party tools will be accurate, reliable, or complete.
- Any defects or errors in the Software will be corrected.
- The Software will be free from viruses or other harmful components.
- Third-party AI CLI tools will produce correct, safe, or functional code.

### 8.3 Use at Your Own Risk

You acknowledge that your use of the Software and any third-party tools integrated with it is at your sole risk and discretion. You are solely responsible for evaluating the suitability of the Software for your intended use.

---

## 9. Limitation of Liability

### 9.1 Exclusion of Consequential Damages

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL THE DEVELOPER, ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO:

- Damages for loss of profits, goodwill, data, or other intangible losses.
- Damages arising from the use of or inability to use the Software.
- Damages arising from commands executed through terminal sessions.
- Damages arising from file system operations performed through the Software.
- Damages arising from code or content generated by third-party AI CLI tools.
- Damages arising from security breaches or unauthorized access to your system.
- Damages arising from the loss or corruption of data, files, or projects.
- Damages arising from any third-party service accessed through the Software.

### 9.2 Liability Cap

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE DEVELOPER'S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THESE TERMS OR THE SOFTWARE SHALL NOT EXCEED THE AMOUNT YOU PAID TO THE DEVELOPER FOR THE SOFTWARE, WHICH IS ZERO ($0.00) GIVEN THAT THE SOFTWARE IS PROVIDED FREE OF CHARGE.

### 9.3 Basis of the Bargain

You acknowledge that the limitations of liability in this Section 9 are a fundamental basis of the bargain between you and the Developer, and that the Developer would not provide the Software without such limitations.

### 9.4 Applicability

Some jurisdictions do not allow the exclusion or limitation of certain warranties or liabilities. In such jurisdictions, the Developer's liability shall be limited to the maximum extent permitted by applicable law.

---

## 10. Indemnification

### 10.1 Your Indemnification Obligations

You agree to indemnify, defend, and hold harmless the Developer, its affiliates, officers, directors, employees, agents, and licensors from and against any and all claims, demands, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or related to:

- Your use of the Software, including any actions performed through terminal sessions or file operations.
- Your use of any third-party AI CLI tools or services accessed through the Software.
- Any code, content, or output generated through your use of the Software or integrated third-party tools.
- Your violation of these Terms.
- Your violation of any applicable law, regulation, or third-party right.
- Any claims by third parties arising from your use of the Software.
- Any damage caused to third-party systems, networks, or data through your use of the Software.
- Your violation of the terms of service of any third-party AI CLI tool or service.

### 10.2 Developer's Right to Participate

The Developer reserves the right, at its own expense, to assume the exclusive defense and control of any matter subject to indemnification by you, and in such case, you agree to cooperate with the Developer's defense of such claim.

---

## 11. Terminal & File System Access

### 11.1 Terminal Access

The Software creates pseudo-terminal (PTY) sessions that operate with the full permissions of your user account. This means:

- **Commands executed in terminal sessions have the same privileges as your user account.** This includes the ability to read, write, modify, and delete files within your permission scope.
- **AI-generated commands are executed with your full user-level permissions.** When you use the agent task execution feature, commands generated by third-party AI tools are written directly into terminal sessions and may be executed with your user-level permissions.
- **The Developer is not responsible for commands executed in terminal sessions,** whether entered manually or generated by AI tools. You should review all commands before execution.
- **Terminal sessions may access network resources,** install packages, modify system configurations, and perform other operations within your user's permission scope.

### 11.2 File System Access

The Software provides comprehensive file system access, including:

- **Full read, write, create, delete, rename, move, duplicate, and import operations** on files and directories within your user-level permissions.
- **Path traversal validation** is implemented to help prevent unauthorized access outside of intended directories. However, no security mechanism is foolproof.
- **A 10 MB file read limit** is enforced for individual file operations.
- **File operations are user-initiated.** The Software does not autonomously modify your files without your action, except as required for normal application operation (such as saving preferences and workspace state).

### 11.3 Assumption of Risk

You expressly acknowledge and assume the following risks:

- Running unknown or unreviewed commands in terminal sessions may result in data loss, system instability, or security vulnerabilities.
- AI-generated code may contain errors, security flaws, or malicious content. You should always review AI-generated output before executing or deploying it.
- File operations performed through the Software may result in irreversible data loss. You should maintain regular backups of important data.
- The Software's agent task execution feature sends your prompts to third-party AI tools. The Developer has no control over how those prompts are processed or what commands are generated.
- The Software runs with your user-level permissions and does not impose additional sandboxing or restrictions on terminal or file operations.

### 11.4 Best Practices

The Developer strongly recommends that you:

- Always review and understand any command before executing it in a terminal session.
- Never execute commands generated by AI tools without careful review.
- Use version control (such as Git) to track and enable rollback of file changes.
- Maintain regular backups of all important files and projects.
- Use the Software in a development or testing environment before applying changes to production systems.
- Be cautious when using the Software to access sensitive or critical system files.

---

## 12. Feedback

### 12.1 Voluntary Submission

The Software includes a built-in feedback mechanism that allows you to submit feedback, comments, suggestions, bug reports, and other communications to the Developer via Discord webhook. Submission of feedback is entirely **voluntary**.

### 12.2 Information Included in Feedback

When you submit feedback, the following information may be transmitted:

- Your feedback message (required).
- An optional display name (provided at your discretion).
- Optional contact information (provided at your discretion).
- A timestamp of the submission.

### 12.3 License Grant for Feedback

By submitting feedback, you grant the Developer a perpetual, irrevocable, worldwide, royalty-free, fully paid-up, non-exclusive, transferable, sublicensable license to:

- Use, reproduce, modify, adapt, publish, distribute, and exploit the feedback for any purpose, including but not limited to improving the Software.
- Incorporate the feedback into the Software or any other products or services.
- Use the feedback without any obligation of attribution, compensation, or confidentiality to you.

### 12.4 No Obligation

The Developer has no obligation to:

- Respond to your feedback.
- Implement any suggestions or recommendations contained in your feedback.
- Keep any feedback confidential.
- Provide attribution for any use of your feedback.

---

## 13. Updates

### 13.1 Update Mechanism

The Software includes an auto-update system that checks the GitHub Releases API for available updates. The update behavior is as follows:

- **Update checking** is enabled by default. The Software periodically contacts the GitHub Releases API to determine whether a newer version is available.
- **Automatic downloading** of updates is **disabled by default.** You must opt in to automatic downloading of updates.
- **Public key signature verification** is used to validate the authenticity of downloaded updates before installation.

### 13.2 Update Channels

The Software may offer multiple update channels, including:

- **Stable** — Recommended for most users. Contains thoroughly tested releases.
- **Beta** — May contain features that are still in testing. May be less stable than stable releases.
- **Nightly** — The most frequently updated channel. May contain significant bugs or incomplete features.

You are responsible for understanding the risks associated with each update channel and selecting the channel appropriate for your needs.

### 13.3 No Guarantee of Updates

The Developer does not guarantee that:

- Updates will be made available on any specific schedule.
- Updates will be compatible with your current system configuration.
- Updates will not introduce new bugs, issues, or incompatibilities.
- Any specific feature or bug fix will be included in future updates.
- Updates will continue to be provided indefinitely.

### 13.4 Your Consent

By using the Software with update checking enabled, you consent to periodic connections to the GitHub Releases API. If you disable update checking, no such connections will be made.

---

## 14. Termination

### 14.1 Your Right to Terminate

You may terminate these Terms at any time by:

- Uninstalling the Software from all of your devices.
- Ceasing all use of the Software.
- Destroying any copies of the Software in your possession.

### 14.2 Developer's Right to Terminate

The Developer may terminate these Terms at any time, with or without cause, and with or without notice, including but not limited to if:

- You violate any provision of these Terms.
- You use the Software in a manner that is unlawful or harmful.
- The Developer discontinues the Software.

### 14.3 Effect of Termination

Upon termination of these Terms:

- Your right to use the Software immediately ceases.
- You must uninstall and destroy all copies of the Software.
- Sections 7 (Intellectual Property), 8 (Disclaimer of Warranties), 9 (Limitation of Liability), 10 (Indemnification), and 14.3 (Effect of Termination) shall survive termination.
- The Developer is not liable for any damage or loss resulting from the termination of these Terms.

### 14.4 No Refund Obligation

Since the Software is provided free of charge, no refund or compensation shall be owed upon termination.

---

## 15. Changes to Terms

### 15.1 Right to Modify

The Developer reserves the right to modify, amend, or update these Terms at any time and at its sole discretion.

### 15.2 Notification of Changes

- Changes to these Terms will be reflected by updating the "Effective Date" at the top of this document.
- The Developer may, but is not obligated to, notify you of material changes through the Software, the project's GitHub repository (https://github.com/wolfenazz/YzPzCode), or other reasonable means.
- It is your responsibility to periodically review these Terms for changes.

### 15.3 Acceptance of Changes

Your continued use of the Software after any changes to these Terms constitutes your acceptance of the revised Terms. If you do not agree with the modified Terms, you must stop using the Software and uninstall it from your devices.

---

## 16. Governing Law

### 16.1 Jurisdiction

These Terms shall be governed by and construed in accordance with the laws of the jurisdiction in which the Developer is located, without regard to its conflict of law provisions.

### 16.2 Dispute Resolution

Any disputes arising out of or related to these Terms or the Software shall be resolved first through good-faith negotiation. If negotiation fails, disputes shall be resolved in the courts of the Developer's jurisdiction.

### 16.3 Severability

If any provision of these Terms is found to be unenforceable or invalid by a court of competent jurisdiction, that provision shall be limited or eliminated to the minimum extent necessary so that the remaining provisions remain in full force and effect. The remaining provisions of these Terms shall continue to be valid and enforceable.

### 16.4 Waiver

The failure of the Developer to enforce any right or provision of these Terms shall not constitute a waiver of such right or provision. Any waiver of any provision of these Terms will be effective only if in writing and signed by the Developer.

### 16.5 Entire Agreement

These Terms, together with any policies referenced herein, constitute the entire agreement between you and the Developer regarding the use of the Software and supersede all prior or contemporaneous understandings, agreements, representations, and warranties regarding the Software.

### 16.6 Assignment

You may not assign or transfer these Terms or your rights hereunder, in whole or in part, without the Developer's prior written consent. The Developer may assign its rights and obligations under these Terms without restriction.

### 16.7 Force Majeure

The Developer shall not be liable for any failure or delay in performing its obligations under these Terms where such failure or delay results from circumstances beyond the Developer's reasonable control, including but not limited to acts of God, natural disasters, war, terrorism, riots, embargoes, acts of civil or military authorities, fire, floods, accidents, strikes, or shortages of transportation, facilities, fuel, energy, labor, or materials.

---

## 17. Contact Information

If you have any questions, concerns, or feedback regarding these Terms of Service or the Software, you may contact the Developer through the following channels:

- **GitHub Repository:** https://github.com/wolfenazz/YzPzCode
- **In-App Feedback:** Use the built-in feedback form accessible within the Software.

The Developer will endeavor to respond to inquiries in a timely manner but does not guarantee a specific response time.

---

**Last Updated: April 6, 2026**

**By using YzPzCode, you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.**
