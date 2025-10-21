# Developer Installation Guide

This guide provides instructions for setting up the development environment, building the Speak2Script extension, and installing it locally in Visual Studio Code or Cursor.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

-   [Node.js](https://nodejs.org/) (which includes npm)
-   [Visual Studio Code](https://code.visualstudio.com/) or [Cursor](https://cursor.sh/)

## 1. Clone the Repository

First, clone the project from GitHub to your local machine:

```bash
git clone https://github.com/TopTuK/whisper-assistant-vscode.git
cd whisper-assistant-vscode
```

## 2. Install Dependencies

Next, install the project's dependencies using npm:

```bash
npm install
```

## 3. Build the Extension

To build the extension, you need to compile the TypeScript code and then package it into a `.vsix` file.

### Compile the Code

Run the following command to compile the TypeScript source code into JavaScript:

```bash
npm run compile
```

This will create an `out` directory containing the compiled JavaScript files.

### Package the Extension

Now, package the extension into a `.vsix` file using the `vsce` tool:

```bash
npx vsce package
```

This will create a file named `speak2script-<version>.vsix` in the root of the project directory.

## 4. Install the Extension

Finally, install the packaged extension in VS Code or Cursor.

### From the Command Line

You can install the extension from the command line using the following command:

```bash
code --install-extension speak2script-*.vsix
```

Or for Cursor:

```bash
cursor --install-extension speak2script-*.vsix
```

### From the UI

Alternatively, you can install the extension through the VS Code or Cursor UI:

1.  Open VS Code or Cursor.
2.  Go to the **Extensions** view (you can use the shortcut `Ctrl+Shift+X` or `Cmd+Shift+X`).
3.  Click on the **...** (More Actions) menu in the top-right corner of the Extensions view.
4.  Select **Install from VSIX...**.
5.  Navigate to the project directory and select the `speak2script-*.vsix` file.
