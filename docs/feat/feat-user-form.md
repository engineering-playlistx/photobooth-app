# Feature: User Form

## Overview

The form screen collects the user's contact information before AI generation begins. It captures name, email, and phone number, and requires the user to consent to their data being used. All input is validated client-side before allowing submission. An on-screen keyboard is provided for touch/kiosk use.

---

## Route

`/form` — `apps/frontend/src/routes/form.tsx`

Navigated to from `/camera`. On valid submission, navigates to `/loading`.

---

## Technical Architecture

### Fields

| Field | Required | Validation |
|-------|----------|------------|
| Name | Yes | Non-empty |
| Email | Yes | Regex: standard email format |
| Phone | Yes | Regex: Indonesian format — `(\+62\|62\|0)[0-9\-]{9,15}` |
| Consent checkbox | Yes | Must be checked |

All fields must pass validation before the "Submit" button becomes active.

### On-Screen Keyboard

Uses the `simple-keyboard` library (`SimpleKeyboard` component in `src/components/`) to provide a touch-friendly virtual keyboard — required because kiosk deployments have no physical keyboard. The keyboard is displayed below the form and feeds input into whichever field is currently focused.

### Validation

Validation runs on form submission (not on every keystroke). Error messages are displayed per-field. The regex patterns are:

```typescript
// Email
/^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Phone (Indonesian format)
/^(\+62|62|0)[0-9\-]{9,15}$/
```

### State Written

On successful submission, writes to `PhotoboothContext.userInfo`:

```typescript
userInfo: {
  name: string;
  email: string;
  phone: string;
}
```

---

## Intersection with Other Features

| Feature | How User Info Flows In |
|---------|----------------------|
| [AI Photo Generation](feat-ai-photo-generation.md) | `userInfo` is not sent to the AI endpoint — it's only used for cloud storage and email. |
| [Cloud Storage & User Record](feat-cloud-storage-user-record.md) | `userInfo.name`, `.email`, `.phone` are sent to `POST /api/photo`. The backend normalizes the phone to `+62` format before inserting into Supabase. |
| [Local Persistence](feat-local-persistence.md) | `userInfo` is stored as a JSON string in the SQLite `photo_results.user_info` column. |
| [Admin Data Viewer](feat-admin-data-viewer.md) | The admin table displays name, email, and phone from the stored `user_info` JSON. |

---

## Notes

- Phone normalization (e.g., `0812...` → `+62812...`) happens on the **backend** (`UserRepository`), not on the frontend. The frontend stores and transmits the raw value the user typed.
- The consent checkbox is required but its value is not persisted anywhere — it serves only as a gate before submission.
- In kiosk mode, the on-screen keyboard is the primary input method. The `simple-keyboard` component maps to standard input `onChange` handlers.
