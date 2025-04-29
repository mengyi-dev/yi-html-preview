# Yi HTML Preview ✨

[![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/Mengyi.yi-html-preview?style=flat-square&label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=Mengyi.yi-html-preview)
[![VS Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/Mengyi.yi-html-preview?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Mengyi.yi-html-preview)
[![VS Marketplace Rating](https://img.shields.io/visual-studio-marketplace/r/Mengyi.yi-html-preview?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=Mengyi.yi-html-preview)
**Instantly preview your HTML files live inside Visual Studio Code!** See your changes rendered in real-time without needing to switch to an external browser. Features responsive design tools to help test your layouts across different screen sizes.

---

<br/>

## Features

* 📄 **Live HTML Preview:** Opens an accurate preview panel right beside your HTML editor.
* 🔄 **Real-time Updates:** The preview automatically refreshes as you type or save (debounced for performance).
* 📱 **Responsive Design Tools:**
    * **Device Presets:** Quickly switch between common screen sizes (Mobile, Tablet, Laptop) or use a flexible Desktop view.
    * **Orientation Toggle:** Easily flip between Portrait and Landscape modes for fixed-size device presets.
    * **Visual Device Frame:** A simple, clean frame is shown around fixed-size previews for better context.
* 🔗 **Relative Path Resolution:** Automatically handles relative paths in your HTML for linked CSS, images, and JavaScript files, ensuring resources load correctly in the preview.
* 🔒 **Secure & Sandboxed:** Uses VS Code's Webview API with a sandboxed `<iframe>` and Content Security Policy for safe rendering.
* ✨ **Clean Integration:** Manages previews on a per-file basis and cleans up resources automatically when files or panels are closed.

## Usage

1.  Open any HTML file (`.html`, `.htm`) in your VS Code editor.
2.  Open the **Command Palette** (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on macOS).
3.  Type `Yi HTML Preview` and select the command "**Yi HTML Preview: Show Preview**".
4.  The preview panel will open adjacent to your active editor.
5.  Use the control bar at the top of the preview panel to select different device sizes and toggle the orientation.

## Screenshots

*(**IMPORTANT**: Replace these placeholders with links to your actual screenshots or GIFs hosted somewhere like GitHub or an image hosting service. Good visuals are key!)*

**1. Basic Side-by-Side Preview:**
![Basic Preview](https://github.com/mengyi-dev/yi-html-preview/yi-html-preview/img/1.png)
*(Caption: Shows the HTML code editor on one side and the live rendered preview panel on the other.)*

**2. Responsive Controls Bar:**
![Responsive Controls](https://github.com/mengyi-dev/yi-html-preview/yi-html-preview/img/2.png)
*(Caption: Close-up of the control bar showing the Mobile, Tablet, Laptop, Desktop, and Orientation buttons.)*

**3. Mobile View (Portrait & Landscape):**
*(Caption: Example showing a site previewed in the Mobile preset, perhaps animating the orientation toggle.)*

**4. Tablet View (Portrait & Landscape):**
*(Caption: Example showing a site previewed in the Tablet preset within the visual device frame.)*

## Known Issues

* The preview environment is sandboxed for security. Complex JavaScript, especially involving direct DOM manipulation of the *outer* frame, cross-origin requests, or certain newer/experimental browser APIs, might behave differently than in a full, standalone browser.
* While `<base>` tag injection handles most relative path scenarios, very complex project structures or build tool outputs might require manual path adjustments in some cases.

## Release Notes / Changelog

For details on changes in each version, please see the [CHANGELOG.md](CHANGELOG.md) file.
*(**Tip**: Create a `CHANGELOG.md` file in your project root to document updates.)*

## License

This extension is distributed under the [MIT License](LICENSE).
*(**Tip**: Make sure you have a `LICENSE` file in your project root containing the MIT license text.)*

---

**Enjoying Yi HTML Preview? Please consider leaving a rating or review on the Marketplace!**