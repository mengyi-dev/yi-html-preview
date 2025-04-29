import * as vscode from 'vscode';
import * as path from 'path';

const previewPanels = new Map<string, vscode.WebviewPanel>();
let updateTimeout: NodeJS.Timeout | undefined;

// Escapes characters problematic for embedding inside an HTML attribute value (like srcdoc="...")
function escapeHtmlForAttributeValue(unsafe: string): string {
    if (typeof unsafe !== 'string') return '';
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
        // Base tag itself - no attribute escaping needed here yet
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
    const initialHtmlWithBase = injectBaseHref(rawUserHtml, baseHrefTagString);
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

    // Updated CSS with device frame styles and landscape dimensions
    const styles = `
        body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background-color: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-font-family, sans-serif); display: flex; flex-direction: column; }
        .controls { padding: 8px 15px; background-color: var(--vscode-sideBar-background); border-bottom: 1px solid var(--vscode-sideBar-border); flex-shrink: 0; display: flex; gap: 15px; align-items: center; flex-wrap: wrap; }
        .controls label { font-size: 12px; margin-right: -5px; white-space: nowrap; }
        .controls button { padding: 4px 8px; background-color: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; font-size: 12px; white-space: nowrap; }
        .controls button:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
        .controls button.active { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: var(--vscode-button-border, transparent); }
        .controls button:disabled { opacity: 0.5; cursor: not-allowed; }
        #preview-container { flex-grow: 1; overflow: auto; padding: 25px; display: flex; justify-content: center; align-items: flex-start; background-color: var(--vscode-editorWidget-background); }

        /* Simple Device Frame Wrapper */
        #iframe-wrapper {
            flex-shrink: 0; /* Prevent shrinking in flex container */
            border: 8px solid #444;
            border-radius: 16px;
            overflow: hidden; /* Clip iframe corners */
            box-shadow: 0 8px 20px rgba(0,0,0,0.25);
            background: #444; /* Color behind iframe, visible with border-radius */
            transition: width 0.3s ease-in-out, height 0.3s ease-in-out;
            width: 100%; /* Default: Desktop */
            height: 100%;
        }
        #preview-frame {
            display: block; /* Remove potential inline spacing */
            border: none;
            background-color: white;
            width: 100%; /* Iframe always fills wrapper */
            height: 100%;
        }

        /* --- Size Presets (Applied to Wrapper) --- */
        /* Mobile */
        #iframe-wrapper.mobile { width: 375px; height: 667px; border-width: 6px; border-radius: 18px;}
        #iframe-wrapper.mobile.landscape { width: 667px; height: 375px; }
        /* Tablet */
        #iframe-wrapper.tablet { width: 768px; height: 1024px; border-width: 10px; border-radius: 20px;}
        #iframe-wrapper.tablet.landscape { width: 1024px; height: 768px; }
        /* Laptop */
        #iframe-wrapper.laptop { width: 1366px; height: 768px; border-width: 10px; border-radius: 12px;}
        #iframe-wrapper.laptop.landscape { width: 768px; height: 1366px; } /* Note: Often laptops don't rotate, but we allow it */
        /* Desktop (No fixed size on wrapper, relies on container) */
        #iframe-wrapper.desktop { width: 100%; height: 100%; max-width: 1920px; border: none; border-radius: 0; box-shadow: none; background: transparent; }
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
        <span style="margin-left: 10px;"></span> <button id="toggleOrientation" title="Toggle Orientation (Portrait/Landscape)" disabled>🔄 Orientation</button>
    </div>
    <div id="preview-container">
         <div id="iframe-wrapper" class="desktop">
             <iframe id="preview-frame"
                     sandbox="allow-scripts allow-same-origin allow-forms allow-pointer-lock allow-popups allow-modals"
                     srcdoc="${escapedForInitialSrcdocAttribute}">
            </iframe>
         </div>
    </div>
    <script nonce="${nonce}">
        (function() {
            const vscode = acquireVsCodeApi();
            const iframe = document.getElementById('preview-frame');
            const iframeWrapper = document.getElementById('iframe-wrapper'); // Get wrapper
            const sizeButtons = document.querySelectorAll('.controls button[data-size]');
            const orientationButton = document.getElementById('toggleOrientation');
            const container = document.getElementById('preview-container');

            let currentSize = 'desktop';
            let isLandscape = false;
            const baseHrefTagString = ${JSON.stringify(baseHrefTagString)};

            if (!iframe || !iframeWrapper || !orientationButton) {
                console.error('Preview UI elements not found!');
                return;
            }

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

            function updateOrientationButtonState() {
                orientationButton.disabled = (currentSize === 'desktop');
                // Update button text/icon (optional)
                // orientationButton.textContent = isLandscape ? '🔄 Landscape' : '🔄 Portrait';
            }

            // Listener for messages from the extension (e.g., HTML updates)
            window.addEventListener('message', event => {
                const message = event.data;
                switch (message.command) {
                    case 'updateContent':
                        try {
                            const rawUpdateHtml = message.html;
                            const htmlWithBase = injectBaseHrefIntoString(rawUpdateHtml, baseHrefTagString);
                            // Assign raw HTML directly to srcdoc property
                            iframe.srcdoc = htmlWithBase;
                        } catch (e) {
                             console.error("Error updating srcdoc:", e);
                             iframe.srcdoc = '<html><body>Error updating preview content. Check console.</body></html>';
                        }
                        break;
                 }
            });

            // Add listeners to the screen size control buttons
            sizeButtons.forEach(button => {
                button.addEventListener('click', () => {
                    const size = button.getAttribute('data-size');
                    if (size && size !== currentSize) {
                        currentSize = size;
                        isLandscape = false; // Reset orientation when changing size
                        sizeButtons.forEach(btn => btn.classList.remove('active'));
                        button.classList.add('active');

                        // Apply size class to wrapper, remove orientation class
                        iframeWrapper.className = ' '; // Clear existing classes first
                        iframeWrapper.classList.add(size);

                        // Adjust container alignment
                        if (size === 'desktop') {
                            container.style.alignItems = 'stretch';
                        } else {
                            container.style.alignItems = 'flex-start';
                        }
                        updateOrientationButtonState(); // Update button enabled state
                    }
                });
            });

             // Add listener for orientation button
             orientationButton.addEventListener('click', () => {
                if (currentSize === 'desktop') return; // Should be disabled, but double check

                isLandscape = !isLandscape;
                if (isLandscape) {
                    iframeWrapper.classList.add('landscape');
                } else {
                    iframeWrapper.classList.remove('landscape');
                }
                updateOrientationButtonState(); // Update text/icon if needed
            });


            // Set initial container alignment and button state
            if (currentSize === 'desktop') {
                 container.style.alignItems = 'stretch';
            } else {
                 container.style.alignItems = 'flex-start';
            }
            updateOrientationButtonState(); // Set initial button state


        }());
    </script>
</body>
</html>`;
}

// Function to update webview content, either by resetting HTML or posting a message
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