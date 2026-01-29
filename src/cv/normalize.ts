import { getExtensionFromMimeType } from "../lib/storage"

export function normalizeFilename(
    firstName: string | null,
    lastName: string | null,
    mimeType: string
): string {
    const ext = getExtensionFromMimeType(mimeType)

    const first = sanitizeName(firstName || "Applicant")
    const last = sanitizeName(lastName || "")

    if (last) {
        return `${first}_${last}_CV.${ext}`
    }
    return `${first}_CV.${ext}`
}

function sanitizeName(name: string): string {
    return name
        .trim()
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "")
}
