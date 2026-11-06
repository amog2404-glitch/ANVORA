# THIRD-PARTY SOFTWARE NOTICES & ATTRIBUTIONS

ANVORA — AUTONOMOUS INTELLIGENCE incorporates open-source third-party software and components.
This document details the licensing, upstream sources, and modifications made to these components.

---

## 1. Upstream Foundation: Lucy Browser Assistant

- **Original Project:** Lucy (Voice-First Autonomous Browser Assistant)
- **Original Author:** Shreyas ([@imshreyaskn](https://github.com/imshreyaskn))
- **Original Repository:** [https://github.com/imshreyaskn/lucy](https://github.com/imshreyaskn/lucy)
- **License:** MIT License
- **Copyright:** (c) 2024-2025 Shreyas
- **Substantial Modifications & Extensions by ANVORA (2026):**
  - **Rebranding:** Evolved identity from Lucy to ANVORA — Autonomous Intelligence.
  - **User Interface:** Re-engineered side panel with an Apple-inspired Liquid Glass UI, floating frosted acrylic dock, responsive drawers, and animated 3D vitreous voice orb.
  - **Fast-Path Command Routing:** Added deterministic local intent classification bypassing LLMs for simple commands (<30 ms latency).
  - **ChatGPT-Style Voice Dictation:** Built push-to-start / push-to-stop continuous audio capture via `MediaRecorder` with automatic transcription and submission.
  - **Multilingual Support:** Extended speech-to-text, text-to-speech, and intent understanding to Hindi (हिन्दी) and Telugu (తెలుగు) alongside English, preserving original language scripts without forced translation.
  - **Transcription Providers:** Integrated Groq Whisper (`whisper-large-v3-turbo`) and Gemini multimodal audio transcription fallbacks.
  - **Network & Error Classifier:** Implemented real-time connectivity probing (`generate_204`) and specific classification for rate limits (429), quota exhaustion, and auth errors to eliminate false "No internet" messages.
  - **Persistent Memory & Personalization (Phase 6):** Built dual-tier memory with privacy pattern filtering and task continuity resumption.
  - **Proactive Workflow Automation (Phase 7):** Developed natural language workflow scheduling, website monitoring, conditional execution, and change alerts.

---

## 2. Runtime Dependencies

### React & React DOM
- **Version:** `^19.0.1`
- **Source:** [https://github.com/facebook/react](https://github.com/facebook/react)
- **Author:** Meta Platforms, Inc.
- **License:** MIT License
- **Copyright:** (c) Meta Platforms, Inc. and affiliates.

### Lucide React (`lucide-react`)
- **Version:** `^0.546.0`
- **Source:** [https://github.com/lucide-icons/lucide](https://github.com/lucide-icons/lucide)
- **Author:** Lucide Contributors
- **License:** ISC License
- **Copyright:** (c) Lucide Contributors

### SiriWave (`siriwave`)
- **Version:** `^2.4.0`
- **Source:** [https://github.com/kopiro/siriwave](https://github.com/kopiro/siriwave)
- **Author:** Flavio De Stefano
- **License:** MIT License
- **Copyright:** (c) Flavio De Stefano

---

## 3. Build & Development Tools

### Tailwind CSS & Vite Plugin (`tailwindcss`, `@tailwindcss/vite`)
- **Version:** `^4.3.3`
- **Source:** [https://github.com/tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss)
- **Author:** Tailwind Labs Inc.
- **License:** MIT License
- **Copyright:** (c) Tailwind Labs Inc.

### CRXJS Vite Plugin (`@crxjs/vite-plugin`)
- **Version:** `^2.0.0-beta.33`
- **Source:** [https://github.com/crxjs/chrome-extension-tools](https://github.com/crxjs/chrome-extension-tools)
- **Author:** CRXJS Contributors
- **License:** MIT License

### Vite
- **Version:** `^8.0.12`
- **Source:** [https://github.com/vitejs/vite](https://github.com/vitejs/vite)
- **Author:** Yuxi (Evan) You and Vite contributors
- **License:** MIT License
- **Copyright:** (c) 2019-present Evan You & Vite Contributors

### TypeScript
- **Version:** `~6.0.2`
- **Source:** [https://github.com/microsoft/TypeScript](https://github.com/microsoft/TypeScript)
- **Author:** Microsoft Corporation
- **License:** Apache License 2.0
- **Copyright:** (c) Microsoft Corporation

---

## 4. Fonts

### Inter & Plus Jakarta Sans
- **Source:** Google Fonts
- **License:** SIL Open Font License, Version 1.1 (OFL)
- **Copyright:**
  - Inter: (c) 2016-2024 The Inter Project Authors
  - Plus Jakarta Sans: (c) 2020 The Plus Jakarta Sans Project Authors

