# 🤖 PR Review Assistant

A GitHub Action that automates code reviews on pull requests using Sourcegraph's Cody AI. This action analyzes changed files, provides actionable feedback, and posts both inline comments and a summary review to your pull requests.

## 📑 Table of Contents

- [🤖 PR Review Assistant](#-pr-review-assistant)
  - [📑 Table of Contents](#-table-of-contents)
  - [✨ Features](#-features)
  - [🏁 Prerequisites](#-prerequisites)
  - [🚀 Setup](#-setup)
    - [💤 TLDR](#-tldr)
    - [📋 PR Review Guidelines](#-pr-review-guidelines)
    - [📋 Usage](#-usage)
  - [⚙️ Configuration](#️-configuration)
    - [⚠️ Notes](#️-notes)
  - [🛠️ Customization](#️-customization)
  - [🔄 How It Works](#-how-it-works)
  - [🔍 Troubleshooting](#-troubleshooting)
  - [🗺️ Roadmap](#️-roadmap)
    - [🚀 Proposed Future Enhancements](#-proposed-future-enhancements)
  - [👥 Contributing](#-contributing)

## ✨ Features

- 🔍 Automatically reviews pull request changes
- 💬 Posts inline code comments for specific issues
- 📋 Generates a comprehensive review summary
- 🔄 Batches file reviews for optimal processing
- 🛡️ Handles errors gracefully to ensure workflow completion
- ✅ Follows configurable code quality guidelines

## 🏁 Prerequisites

- 🔑 Sourcegraph account with Cody access
- 📁 GitHub repository with Actions enabled
- 📝 `PR-Review-Guidelines.md` file in your repository (see below)

## 🚀 Setup

### 💤 TLDR

- 📄 Create a `PR-Review-Guidelines.md` file in your top level repo and add some review rules
- ✍️ Create a `pr-review.yaml` file and add the code below
- 🔑 Retrieve your [Sourcegraph](https://sourcegraph.com/user/settings/tokens/new) individual access token and add that to your repo's secret

### 📋 PR Review Guidelines

This action requires a `PR-Review-Guidelines.md` file in your repository that defines the standards and format for code reviews. This file instructs Cody on how to evaluate code changes and structure feedback.

The guidelines should include sections for:

- 💻 Code quality standards
- 🧪 Testing requirements
- 🔒 Security & performance considerations
- 📚 Documentation expectations
- 🎯 Review format specifications

You can copy the example guidelines from this repository or customize them to match your team's coding standards.

### 📋 Usage

Add the following workflow to your repository - `.github/workflows/pr-review.yaml`:

```yaml copy
name: PR Review Assistant
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Run PR Review Assistant
        uses: <your-github-username>/actions-pr-review-assistant@v1
        # Replace <SOURCEGRAPH_SECRET> with the name of your Sourcegraph token secret        
        # Replace <your-github-username> with your GitHub username or org
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SRC_ACCESS_TOKEN: ${{ secrets.<SOURCEGRAPH_SECRET> }}
          SRC_ENDPOINT: https://sourcegraph.com
          INCLUDE_PATTERNS: '.js, .ts, .jsx, .tsx'
          EXCLUDE_PATTERNS: 'node_modules, dist, .json'
          PROGRAMMING_ENVIRONMENT: 'typescript/javascript'
          CUSTOM_SUMMARY_PROMPT: 'Create a summary of all the changes in this PR and add some emojis'
```

## ⚙️ Configuration

The action requires the following environment variables:

| Variable                  | Description                                                               | Required |
| ------------------------- | ------------------------------------------------------------------------- | -------- |
| `GITHUB_TOKEN`            | GitHub token with permissions to comment on PRs                           | Yes      |
| `SRC_ACCESS_TOKEN`        | Sourcegraph access token for Cody authentication                          | Yes      |
| `SRC_ENDPOINT`            | Sourcegraph instance URL                                                  | No       |
| `INCLUDE_PATTERNS`        | Specifies the files name patterns to be included                          | No       |
| `CUSTOM_SUMMARY_PROMPT`   | Specifies the custom summary prompt                                       | No`*`    |
| `PROGRAMMING_ENVIRONMENT` | Specifies the language of your codebase example:`'typescript/javascript'` | No`*`    |

### ⚠️ Notes

- Other environment variables like `GITHUB_WORKSPACE` and `GITHUB_REPOSITORY` are automatically provided by GitHub Actions and don't need to be configured manually.
- `*` If you include `CUSTOM_SUMMARY_PROMPT`, you **must** include `PROGRAMMING_ENVIRONMENT`

## 🛠️ Customization

You can customize the review guidelines by modifying the `PR-Review-Guidelines.md` file in your repository. This file contains instructions for:

- 💻 Code quality standards
- 🧪 Testing requirements
- 🔒 Security and performance considerations
- 📚 Documentation expectations
- 🎯 Review format

## 🔄 How It Works

- 🔧 The action sets up Git and authenticates with Cody
- 📁 Changed files in the PR are fetched and organized into review batches
- 🤖 Each batch is processed by Cody to generate code review feedback
- 💬 Inline comments are created for specific issues
- 📋 A summary review is generated and posted to the PR
- ⚠️ Any errors during batch processing are handled gracefully

## 🔍 Troubleshooting

If you encounter issues:

- 🔑 Ensure your Sourcegraph access token has sufficient permissions
- 🔒 Check that your workflow has `pull-requests: write` permission
- 📊 Review the action logs for detailed error messages
- 🔄 Verify that the Cody CLI is working with your Sourcegraph instance

## 🗺️ Roadmap

### 🚀 Proposed Future Enhancements

**Shared Coding Guidelines**

- Create a language-agnostic set of general coding guidelines and best practices
- Serve as a starting point for integrating the PR Review Assistant across repositories
- Standardize the output format for all prompts, ensuring consistent feedback across repositories

**Categorized Review Feedback**

- Categorize feedback into levels like Critical, Major, Minor, and Suggestions
- This structured approach will help maintain a better signal-to-noise ratio, especially for larger PRs

**Integration with SonarQube**

- Explore how to best combine insights from the PR Review Assistant and SonarQube without duplicating comments
- Create complementary feedback that maximizes value

**Context-aware Reviews with Jira Integration**

- Integrate Jira ticket details as a context-aware input
- Enhance the assistant's understanding of business logic and requirements
- Ensure more relevant and accurate feedback tailored to the specific needs of each PR

## 👥 Contributing and Support

Contributions are welcome! Please feel free to submit a Pull Request.

