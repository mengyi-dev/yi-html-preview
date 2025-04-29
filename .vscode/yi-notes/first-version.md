import * as vscode from 'vscode';
import * as path from 'path';

const previewPanels = new Map<string, vscode.WebviewPanel>();
let updateTimeout: NodeJS.Timeout | undefined;

// Escapes characters problematic for embedding inside an HTML attribute value (like srcdoc="...")
function escapeHtmlForAttributeValue(unsafe: string): string {
    if (typeof unsafe !== 'string') return '';
    // Escape ampersand first, then double quotes. Less than/greater than are technically not required
    // for attribute values but can sometimes be escaped for belt-and-braces safety.
    // Sticking to the essentials: & and ".
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/"/g, "&quot;");
}

export function activate(context: vscode.ExtensionContext) {
    console.log('"yi-html-preview" is now active!');

    let disposable = vscode.commands.registerCommand('yi-html-preview.showPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage("No active HTML editor found.");
            return;
        }

        if (editor.document.languageId !== 'html') {
             vscode.window.showErrorMessage("Current file is not an HTML file.");
             return;
        }

        const document = editor.document;
        const documentUri = document.uri;
        const documentUriString = documentUri.toString();

        if (previewPanels.has(documentUriString)) {
            const existingPanel = previewPanels.get(documentUriString)!;
            existingPanel.reveal(vscode.ViewColumn.Beside);
            updateWebviewContent(existingPanel, document, false);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            documentUriString,
            `Yi Preview: ${path.basename(document.fileName)}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                localResourceRoots: [
                    ...(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.map(folder => folder.uri) : []),
                    vscode.Uri.file(path.dirname(document.uri.fsPath))
                 ]
                 .filter((uri): uri is vscode.Uri => uri !== undefined)
            }
        );

        previewPanels.set(documentUriString, panel);

        updateWebviewContent(panel, document, true);

        panel.onDidDispose(
            () => {
                previewPanels.delete(documentUriString);
            },
            null,
            context.subscriptions
        );

        panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                   const doc = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === documentUriString);
                   if (doc) {
                     updateWebviewContent(panel, doc, false);
                   }
                }
            },
            null,
            context.subscriptions
         );
    });

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(event => {
        const activePanel = previewPanels.get(event.document.uri.toString());
        if (activePanel && event.document.languageId === 'html') {
             if (updateTimeout) {
                 clearTimeout(updateTimeout);
             }
             updateTimeout = setTimeout(() => {
                 updateWebviewContent(activePanel, event.document, false);
                 updateTimeout = undefined;
             }, 300);
        }
    });

     const closeDocumentSubscription = vscode.workspace.onDidCloseTextDocument(doc => {
        const panel = previewPanels.get(doc.uri.toString());
        if (panel) {
            panel.dispose();
        }
    });

    context.subscriptions.push(disposable, changeDocumentSubscription, closeDocumentSubscription);
}


function getBaseHrefString(webview: vscode.Webview, documentUri: vscode.Uri): string {
    if (!documentUri || documentUri.scheme !== 'file') {
        return '';
    }
    try {
        const docDirUri = vscode.Uri.joinPath(documentUri, '..');
        const webviewUri = webview.asWebviewUri(docDirUri);
        const href = webviewUri.toString().endsWith('/') ? webviewUri.toString() : webviewUri.toString() + '/';
        // No need to escape here, escaping happens when embedding in the attribute
        return `<base href="${href}">`;
    } catch (e) {
        console.error("Error creating webview URI for base href:", e);
        return '';
    }
}

function injectBaseHref(rawHtml: string, baseHrefTag: string): string {
    if (!baseHrefTag || typeof rawHtml !== 'string') {
        return rawHtml || '';
    }
    const cleanHtml = rawHtml.replace(/<base[^>]*>/gi, '');
    const headTagStart = cleanHtml.toLowerCase().indexOf('<head>');
    if (headTagStart !== -1) {
        const headTagEndPos = cleanHtml.indexOf('>', headTagStart);
        if (headTagEndPos !== -1) {
            return cleanHtml.slice(0, headTagEndPos + 1) + baseHrefTag + cleanHtml.slice(headTagEndPos + 1);
        }
    }
    return baseHrefTag + cleanHtml;
}

function getWebviewHtml(webview: vscode.Webview, rawUserHtml: string, documentUri: vscode.Uri): string {
    const nonce = getNonce();
    const baseHrefTagString = getBaseHrefString(webview, documentUri);
    // Inject base tag first
    const initialHtmlWithBase = injectBaseHref(rawUserHtml, baseHrefTagString);
    // Escape *only* for embedding in the srcdoc ATTRIBUTE value
    const escapedForInitialSrcdocAttribute = escapeHtmlForAttributeValue(initialHtmlWithBase);

    const csp = [
        `default-src 'none'`,
        `style-src ${webview.cspSource} 'unsafe-inline' https: data:`,
        `font-src ${webview.cspSource} https: data:`,
        `img-src ${webview.cspSource} https: data:`,
        `script-src 'nonce-${nonce}' 'unsafe-inline' ${webview.cspSource} https:`,
        `frame-src 'self' data: blob: ${webview.cspSource}`,
        `connect-src 'none'`
    ].join('; ');

    const styles = `
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family, sans-serif); display: flex; flex-direction: column; }
        .controls { padding: 5px 10px; background-color: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-sideBar-border); flex-shrink: 0; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .controls button { padding: 4px 8px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap; }
        .controls button:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        .controls button.active { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-border, transparent); }
        .controls label { font-size: 12px; margin-right: 5px; white-space: nowrap; }
        #preview-container { flex-grow: 1; overflow: auto; padding: 15px; display: flex; justify-content: center; align-items: flex-start; background-color: var(--vscode-editorWidget-background); }
        #preview-frame { border: 1px dashed var(--vscode-editorWidget-border, #454545); background-color: white; transition: width 0.25s ease-in-out, height 0.25s ease-in-out; transform-origin: top center; box-shadow: 0 4px 12px rgba(0,0,0,0.2); width: 100%; max-width: 1920px; height: 100%; }
        #preview-frame.mobile { width: 375px; height: 667px; max-width: 375px; }
        #preview-frame.tablet { width: 768px; height: 1024px; max-width: 768px;}
        #preview-frame.laptop { width: 1366px; height: 768px; max-width: 1366px;}
        #preview-frame.desktop { width: 100%; height: 100%; max-width: 1920px; }
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Yi HTML Preview</title>
    <style nonce="${nonce}">${styles}</style>
</head>
<body>
    <div class="controls">
        <label>Screen Size:</label>
        <button data-size="mobile" title="Mobile (375x667)">Mobile</button>
        <button data-size="tablet" title="Tablet (768x1024)">Tablet</button>
        <button data-size="laptop" title="Laptop (1366x768)">Laptop</button>
        <button data-size="desktop" class="active" title="Desktop (Resizable)">Desktop</button>
    </div>
    <div id="preview-container">
         <iframe id="preview-frame"
                 class="desktop"
                 sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals"
                 srcdoc="${escapedForInitialSrcdocAttribute}">
        </iframe>
    </div>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const iframe = document.getElementById('preview-frame');
            const buttons = document.querySelectorAll('.controls button');
            const container = document.getElementById('preview-container');
            let currentSize = 'desktop';
            // Pass the raw base tag string (JSON.stringify handles escaping for JS string literal)
            const baseHrefTagString = ${JSON.stringify(baseHrefTagString)};

            if (!iframe) {
                console.error('Preview iframe not found!');
                return;
            }

            // *** NO LONGER NEED escapeHtml function here for srcdoc ***

            // Helper function inside the script to inject base href (mirrors outer logic)
            function injectBaseHrefIntoString(rawHtml, baseTag) {
                if (!baseTag || typeof rawHtml !== 'string') {
                    return rawHtml || '';
                }
                const cleanHtml = rawHtml.replace(/<base[^>]*>/gi, '');
                const headTagStart = cleanHtml.toLowerCase().indexOf('<head>');
                if (headTagStart !== -1) {
                    const headTagEndPos = cleanHtml.indexOf('>', headTagStart);
                    if (headTagEndPos !== -1) {
                        return cleanHtml.slice(0, headTagEndPos + 1) + baseTag + cleanHtml.slice(headTagEndPos + 1);
                    }
                }
                 return baseTag + cleanHtml; // Fallback prepend
            }

            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateContent':
                        try {
                            const rawUpdateHtml = message.html;
                            const htmlWithBase = injectBaseHrefIntoString(rawUpdateHtml, baseHrefTagString);
                            // *** Assign raw HTML directly to srcdoc property ***
                            iframe.srcdoc = htmlWithBase;
                        } catch (e) {
                             console.error("Error updating srcdoc:", e);
                             // Assign simple error HTML directly
                             iframe.srcdoc = '<html><body>Error updating preview content. Check console.</body></html>';
                        }
                        break;
                 }
            });

            buttons.forEach(button => {
                button.addEventListener('click', () => {
                    const size = button.getAttribute('data-size');
                    if (size && size !== currentSize) {
                        currentSize = size;
                        buttons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');
                        iframe.classList.remove('mobile', 'tablet', 'laptop', 'desktop');
                        iframe.classList.add(size);

                        if (size === 'desktop') {
                            container.style.alignItems = 'stretch';
                            iframe.style.height = '100%';
                        } else {
                            container.style.alignItems = 'flex-start';
                        }
                    }
                });
            });

            if (currentSize === 'desktop') {
                 container.style.alignItems = 'stretch';
            } else {
                 container.style.alignItems = 'flex-start';
            }

        }());
    </script>
</body>
</html>`;
}

function updateWebviewContent(panel: vscode.WebviewPanel, document: vscode.TextDocument, forceHtmlReset: boolean) {
    const htmlContent = document.getText();
     if (forceHtmlReset || !panel.webview.html) {
         panel.webview.html = getWebviewHtml(panel.webview, htmlContent, document.uri);
     } else {
         panel.webview.postMessage({
             command: 'updateContent',
             html: htmlContent
         });
     }
}

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function deactivate() {
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }
    previewPanels.forEach(panel => panel.dispose());
    previewPanels.clear();
    console.log('"yi-html-preview" deactivated.');
}