export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
    const text = await extractPDFText(buffer)
    return text.trim()
}

export async function extractTextFromDOC(buffer: Buffer): Promise<string> {
    const text = extractDOCXText(buffer)
    return text.trim()
}

export async function extractCVText(
    buffer: Buffer,
    mimeType: string
): Promise<string> {
    switch (mimeType) {
        case "application/pdf":
            return extractTextFromPDF(buffer)
        case "application/msword":
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return extractTextFromDOC(buffer)
        default:
            throw new Error(`Unsupported file type: ${mimeType}`)
    }
}

async function extractPDFText(buffer: Buffer): Promise<string> {
    const text = buffer.toString("utf-8")

    const streamMatches = text.matchAll(/stream\n([\s\S]*?)\nendstream/g)
    const extractedParts: string[] = []

    for (const match of streamMatches) {
        const content = match[1]
        const textMatches = content.matchAll(/\(([^)]+)\)/g)
        for (const textMatch of textMatches) {
            extractedParts.push(textMatch[1])
        }

        const tjMatches = content.matchAll(/\[(.*?)\]\s*TJ/g)
        for (const tjMatch of tjMatches) {
            const items = tjMatch[1].matchAll(/\(([^)]*)\)/g)
            for (const item of items) {
                extractedParts.push(item[1])
            }
        }
    }

    if (extractedParts.length === 0) {
        const anyText = text.match(/[A-Za-z]{3,}/g)
        if (anyText) {
            return anyText.join(" ")
        }
        return ""
    }

    return extractedParts
        .join(" ")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "")
        .replace(/\s+/g, " ")
        .trim()
}

function extractDOCXText(buffer: Buffer): string {
    const text = buffer.toString("utf-8")

    const textContent: string[] = []

    const textMatches = text.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)
    for (const match of textMatches) {
        textContent.push(match[1])
    }

    if (textContent.length === 0) {
        const plainText = text.match(/[A-Za-z]{3,}/g)
        if (plainText) {
            return plainText.join(" ")
        }
        return ""
    }

    return textContent.join(" ").replace(/\s+/g, " ").trim()
}
