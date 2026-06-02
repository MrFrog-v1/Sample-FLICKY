# Clickr — Advanced Cursor-Oriented Agentic Assistant

<p align="center">
  <em>A cross-platform, voice-driven, screen-aware Agentic AI companion that runs seamlessly on Windows, macOS, and Linux. Clickr acts as your physical eyes and hands on the operating system, bridging the gap between vocal commands and visual desktop interaction.</em>
</p>

---

## 🚀 Overview

**Clickr** is an open-source evolution of the cursor-oriented assistant concept. Built on modern web technologies (Electron, TypeScript, React 19, and Vite), Clickr lives transparently over your desktop. Simply hold your customizable push-to-talk hotkey, speak your request, and watch an agentic pointing cursor fly across your displays to highlight, locate, and interact with the elements you refer to.

Unlike traditional chatbots that live inside a browser tab, Clickr **sees your screen** and **understands your UI**. By continuously capturing your displays, locating UI elements, and utilizing state-of-the-art multimodal vision LLMs, it can answer contextual questions ("What is this error message?") or guide your attention ("Point to the download button").

---

## ✨ Core Features in Depth

### 🧠 Multimodal Reasoning & Agent Minds
Clickr supports interchangeable "Minds" so you are never locked into a single ecosystem:
*   **Google Gemini (Native `computer_use`)**: Powered by the official `@google/generative-ai` SDK, natively utilizing the `gemini-3-flash-preview` model. Clickr leverages Gemini's native `computer_use` API to accurately map screen coordinates and deduce agentic actions.
*   **OpenRouter**: Access the world's most capable vision models like Claude 3.5 Sonnet, GPT-4o, and Llama 3 Vision.
*   **Groq**: For tasks requiring ultra-low latency, blazingly fast reasoning.
*   **Local Models (Ollama)**: Run completely offline, private LLMs. Pull and manage local models directly from the Clickr control panel.
*   **Reasoning Depth & System Reply Tones**: Toggle between *Off*, *Medium*, and *Deep* (extended thinking) to manage latency. Tailor the AI's communication style (*Concise*, *Friendly*, or *Detailed*) to match your workflow.

### 👁️ Visual Desktop Grounding
*   **Multi-Display Overlay**: Clickr's transparent agent overlay seamlessly spans multiple monitors. The agent-controlled cursor follows your active mouse and target actions across display bounds accurately.
*   **Real-time Element Detection**: Captures Base64-encoded screenshots securely and maps your desktop via a grid locator system, allowing the AI to output precise X/Y coordinates for the pointing cursor.

### 🎙️ Advanced Voice Loop (Ear & Voice)
*   **Push-to-Talk (PTT)**: Global hotkey bindings (e.g., `Ctrl+Alt+X`) allow you to summon Clickr from any app without losing focus.
*   **Groq Whisper Transcription**: Ultra-fast, near-zero-latency voice translation with Whisper Large v3 and v3 Turbo.
*   **ElevenLabs TTS Synthesis**: Premium natural-sounding voice output with stability and speed sliders. Clickr caches voice streams for instant playback.
*   **State Machine**: Clickr visually indicates its status (Idle ➔ Listening ➔ Processing ➔ Responding) via the UI and cursor halo.

### 💾 Private Local Memory
*   **Local Chat History**: Securely saves all conversations onto your machine. Browse past interactions from the side panel.
*   **Infinite Context Compaction**: Employs an automatic token budget monitor. Clickr auto-compacts older parts of the conversation into a rolling summary, ensuring you never overflow context window limits while remembering past details.
*   **On-Device Encryption**: Uses Electron's native `safeStorage` to encrypt all API keys (ElevenLabs, Groq, OpenRouter, Gemini) directly on your local keychain.

---

## 🏗️ Architecture & Internals

Clickr follows a strict Electron architecture, separating heavy native processing from the UI rendering layer.

### Process Structure

#### 1. `src/main/` (Main Process / Node.js Backend)
This layer handles native OS integrations, file system access, and heavy API orchestration.
*   **`index.ts`**: The main entry point that bootstraps the app, registers IPC handlers, and initializes the tray icon.
*   **`companion-manager.ts`**: The "brain" orchestrator. Manages the core state machine (PTT ➔ Screenshot ➔ Transcription ➔ LLM Query ➔ TTS Stream).
*   **`windows.ts`**: A robust Window Manager that controls the main Settings Panel, the floating Stream log window, and the multi-monitor transparent Overlay windows (where the cursor lives).
*   **`services/`**:
    *   **Reasoning APIs**: `gemini-reasoning-api.ts`, `openrouter-reasoning-api.ts`, `groq-reasoning-api.ts`, `ollama-api.ts`.
    *   **`screen-capture.ts`**: Desktop screenshot logic handling multi-monitor bounds.
    *   **`gridLocator.ts`**: Parses UI bounding boxes for accurate coordinate generation.
    *   **`audio-capture.ts` & `transcription.ts`**: Handles microphone input buffers and Whisper API integration.

#### 2. `src/renderer/` (Renderer Process / UI)
A high-performance React 19 application built with Vite.
*   **`panel.html / panel.tsx`**: The main side-panel UI for configuring settings, browsing chat history, and managing API keys.
*   **`overlay.html / overlay.tsx`**: A completely transparent click-through window spanning all displays. It renders the custom animated "agent cursor" that physically moves to coordinates sent by the LLM.
*   **`stream.html / stream.tsx`**: A floating, transparent caption window showing live transcripts and AI thought processes.

#### 3. `src/shared/`
*   **`types.ts`**: Shared TypeScript interfaces and IPC channel strings (e.g., `AI_RESPONSE_CHUNK`, `CURSOR_POSITION`, `ELEMENT_DETECTED`) ensuring strict type-safety across the IPC bridge.

---

## 🛠️ Getting Started

### Prerequisites
*   Node.js (v20 or higher)
*   [Bun](https://bun.sh) (recommended) or `npm`
*   Git

### Installation & Development
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/clickr.git
   cd clickr
   ```
2. Install dependencies:
   ```bash
   bun install
   # or
   npm install
   ```
3. Spin up the Vite renderer and TypeScript watch servers:
   ```bash
   bun run dev
   # or
   npm run dev
   ```
4. In a separate terminal, launch the Electron window:
   ```bash
   bun run start
   # or
   npm run start
   ```

### Production Build & Packaging
Compile and package native installer bundles using `electron-builder`:
```bash
bun run package          # Build installer for the current OS
bun run package:win      # Build Windows executable (.exe via NSIS)
bun run package:mac      # Build macOS disk image (.dmg + .zip)
bun run package:linux    # Build Linux package (AppImage + .deb)
```
*Note: Releases are also produced automatically by GitHub Actions on every `v*` tag via the `.github/workflows/build.yml` pipeline.*

---

## ⚙️ Configuration & API Keys

Clickr respects your privacy. **All API keys and credentials are encrypted and stored locally on your device.** You can configure these in the main UI panel:

1.  **Mind (Reasoning):** Select your primary Reasoning Provider. Enter your Gemini API Key to enable the native `computer_use` integration.
2.  **Ear (Transcription):** Select Groq for sub-second Whisper transcription.
3.  **Voice (TTS):** Add your ElevenLabs API key, select a voice actor preset (e.g., Serena, Antoni), and adjust the speed/stability ratios.
4.  **Local Connections:** Add custom Ollama HTTP endpoints (e.g., `http://localhost:11434`) and easily pull new models like `llava` or `llama3`.

---

## 🤝 Contributing

We welcome contributions! Whether you want to add a new Reasoning Provider (e.g., Anthropic native, Mistral), improve the `gridLocator.ts` detection algorithms, or enhance the React UI:
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📜 License & Attributions

Clickr is licensed under the [MIT License](LICENSE).
