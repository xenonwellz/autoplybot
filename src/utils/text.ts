export function stripMarkdown(text: string): string {
    return (
        text
            .replace(/```[\s\S]*?```/g, "")
            .replace(/`([^`]+)`/g, "$1")
            .replace(/\*\*([^*]+)\*\*/g, "$1")
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/__([^_]+)__/g, "$1")
            .replace(/_([^_]+)_/g, "$1")
            .replace(/~~([^~]+)~~/g, "$1")
            .replace(/^#+\s+/gm, "")
            .replace(/^\s*[-*+]\s+/gm, "")
            .replace(/^\s*\d+\.\s+/gm, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
            .replace(/^>\s+/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim()
    )
}

export function formatTimestamp(date: Date): string {
    return date.toISOString()
}

export function truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength - 3) + "..."
}
