# Product Requirements Document: Wedding Disposable Camera App
**Version 0.1 (draft)** · 8 November 2026 · **Status:** for founder review · **Working title:** [Product name]

## 1. Purpose and document set
This document defines what the first release (v1) of the product must do, who it is for, and how success will be measured. It is the source of truth for scope. Technical design, UX specifications and the backlog are derived from it.

Planned companion documents:
- Technical Architecture and Data Model
- UX Flows and Screen Specifications
- API Specification
- Backlog and Sprint Plan
- QA and Device Test Plan
- Privacy Policy, Terms of Service and Consent Wording
- Budget and Financial Model (spreadsheet)

## 2. Product summary
The Product is a web-based digital disposable camera for weddings. A host (usually the couple) creates an event, chooses the rules, and prints a QR code on signs or table cards. Guests scan the code with their phone camera, a film-style camera opens in the browser with no app download and no account, and each guest takes a limited number of photos, like a roll of film. Photos upload to a private album and are revealed at a time the host chooses. The host then downloads everything.

**Differentiation hypothesis:** the film experience (frame counter, limited shots, developing delay, authentic looks), reliability on poor venue connectivity, and wedding-specific features (such as several rolls per wedding function, in later releases) rather than a generic photo gallery with a camera attached.

## 3. Goals and non-goals
### 3.1 Goals for v1
- **G1.** A guest goes from scanning the QR code to taking the first photo in under 15 seconds, with no app and no account.
- **G2.** No photo is lost, even on weak or intermittent venue connectivity.
- **G3.** A host completes event setup in under 5 minutes.
- **G4.** The camera feels like a disposable camera: limited shots, a visible frame counter, a film-style look and a delayed reveal.
- **G5.** Healthy unit economics: infrastructure and payment cost under 15 percent of the price of an average event.
- **G6.** The architecture supports more event types later through configuration, not rewrites.

### 3.2 Non-goals for v1
- Native iOS or Android apps
- Live photo wall or slideshow
- Video capture
- Guest accounts, likes, comments or any social feed
- Photo books, prints and other physical products
- AI curation, face search or highlight reels
- Event types other than weddings (supported by design, not launched)
- Dedicated tools for photographers and planners (they may use the host features)
- Languages other than English (the interface must be translation-ready)
