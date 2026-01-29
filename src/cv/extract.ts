export function getMimeType(mimeType: string): string {
    switch (mimeType) {
        case "application/pdf":
            return "application/pdf"
        case "application/msword":
            return "application/msword"
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        default:
            throw new Error(`Unsupported file type: ${mimeType}`)
    }
}
