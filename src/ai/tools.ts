import { z } from "zod"
import { tool } from "ai"

const generateEmailParameters = z.object({
    jobDescription: z
        .string()
        .describe("The full job description or posting text"),
    cvText: z.string().describe("The full extracted text from the candidate CV"),
    recipientEmail: z
        .email()
        .describe("The email address to send the application to"),
    companyName: z
        .string()
        .optional()
        .describe("The name of the company, if known"),
    jobTitle: z.string().optional().describe("The job title, if known"),
})

export type GenerateEmailInput = z.infer<typeof generateEmailParameters>
export interface GenerateEmailOutput {
    subject: string
    body: string
}

export const generateEmailTool = tool<GenerateEmailInput, GenerateEmailOutput>({
    description:
        "Generate a job application email based on the job description and candidate CV. Returns email subject and body in plain text.",
    inputSchema: generateEmailParameters,
    execute: async (input: GenerateEmailInput): Promise<GenerateEmailOutput> => {
        return {
            subject: generateSubject(input.jobTitle, input.companyName),
            body: generateBody(input.jobDescription, input.cvText, input.jobTitle, input.companyName),
        }
    },
})

function generateSubject(jobTitle?: string, companyName?: string): string {
    if (jobTitle && companyName) {
        return `Application for ${jobTitle} at ${companyName}`
    }
    if (jobTitle) {
        return `Application for ${jobTitle} Position`
    }
    return "Job Application"
}

function generateBody(
    jobDescription: string,
    cvText: string,
    jobTitle?: string,
    companyName?: string
): string {
    const greeting = companyName
        ? `Dear ${companyName} Hiring Team,`
        : "Dear Hiring Manager,"

    const opening = jobTitle
        ? `I am writing to express my strong interest in the ${jobTitle} position.`
        : "I am writing to express my strong interest in the open position at your company."

    return `${greeting}

${opening}

Based on the role requirements and my background, I believe I would be an excellent fit for this opportunity.

I have attached my CV for your review and would welcome the opportunity to discuss how my experience aligns with your needs.

Thank you for considering my application. I look forward to hearing from you.

Best regards`
}

export const tools = {
    generate_email: generateEmailTool,
}
