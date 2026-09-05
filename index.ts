import * as path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { SessionEntry, SessionHeader } from "@oh-my-pi/pi-coding-agent";
import { collectSubSessions, type SubSession } from "@oh-my-pi/pi-coding-agent/export/html";
import { isRecord } from "@oh-my-pi/pi-utils";

const COMMAND_NAME = "export-md";
const DEFAULT_FILE_PREFIX = "omp-session-";

export type OutputMode = "transcript" | "annotated" | "verbose";

export interface ExportOptions {
	outputPath?: string;
	mode: OutputMode;
	withSubagents: boolean;
	withImages: boolean;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function jsonFence(value: unknown): string {
	const serialized = JSON.stringify(value, null, 2);
	return fenced(serialized ?? "null", "json");
}

function fenced(value: string, language = ""): string {
	const longestRun = Math.max(0, ...Array.from(value.matchAll(/`+/g), match => match[0].length));
	const fence = "`".repeat(Math.max(3, longestRun + 1));
	return `${fence}${language}\n${value}\n${fence}`;
}

function thinkingToMarkdown(thinking: string): string {
	return `> 🧠 **Thinking**\n>\n${thinking
		.split("\n")
		.map(line => `> ${line}`)
		.join("\n")}`;
}

export function contentToMarkdown(content: unknown, mode: OutputMode, withImages = false): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.map(block => {
			if (!isRecord(block)) return "";
			switch (block.type) {
				case "text":
					return stringValue(block.text) ?? "";
				case "thinking": {
					const thinking = stringValue(block.thinking) ?? "";
					if (!thinking) return "";
					if (mode === "transcript") return "";
					return thinkingToMarkdown(thinking);
				}
				case "image": {
					if (mode !== "verbose") return "";
					if (!withImages) return "🖼️ _Image omitted; use `--with-images` to embed it._";
					const data = stringValue(block.data);
					const mimeType = stringValue(block.mimeType) ?? "image/png";
					return data ? `![image](data:${mimeType};base64,${data})` : "![image omitted]";
				}
				case "toolCall": {
					if (mode !== "verbose") return "";
					const name = stringValue(block.name) ?? "tool";
					return `🧰 **Tool call: \`${name}\`**\n\n${jsonFence(block.arguments)}`;
				}
				default:
					return "";
			}
		})
		.filter(Boolean)
		.join("\n\n");
}

// ---------------------------------------------------------------------------
// Role labels
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
	user: "👤 User",
	assistant: "🤖 Assistant",
	toolResult: "🧰 Tool result",
	system: "⚙️ System",
};

function messageRole(message: Record<string, unknown>): string {
	const role = stringValue(message.role) ?? "message";
	return ROLE_LABELS[role] ?? `💬 ${role[0].toUpperCase()}${role.slice(1)}`;
}

// ---------------------------------------------------------------------------
// Entry → Markdown
// ---------------------------------------------------------------------------

export function entryToMarkdown(entry: SessionEntry, mode: OutputMode, withImages = false): string {
	if (entry.type !== "message") {
		if (mode !== "verbose") return "";
		switch (entry.type) {
			case "compaction":
				return `> 🧱 **Compaction**\n>\n${entry.summary.split("\n").map(line => `> ${line}`).join("\n")}`;
			case "branch_summary":
				return `> 🔀 **Branch summary**\n>\n${entry.summary.split("\n").map(line => `> ${line}`).join("\n")}`;
			case "custom_message":
				return `## 🧩 Extension message (${entry.customType})\n\n${contentToMarkdown(entry.content, "verbose", withImages)}`;
			case "model_change":
				return `> ⚙️ Model changed to \`${entry.model}\`${entry.role ? ` (${entry.role})` : ""}`;
			case "thinking_level_change":
				return `> 🧠 Thinking level changed to \`${entry.configured ?? entry.thinkingLevel ?? "default"}\``;
			case "service_tier_change":
				return `> ⚙️ Service tier changed to \`${entry.serviceTier ?? "default"}\``;
			case "reset_boundary":
				return "> 🔄 **Context reset**";
			case "label":
				return entry.label ? `> 🏷️ **Label:** ${entry.label}` : "";
			case "title_change":
				return `> ✏️ **Title changed:** ${entry.title}`;
			default:
				return "";
		}
	}

	const message = entry.message as unknown as Record<string, unknown>;
	const role = stringValue(message.role) ?? "message";
	const isConversationRole = role === "user" || role === "assistant";

	if (mode !== "verbose" && !isConversationRole) return "";

	const body = contentToMarkdown(message.content, mode, withImages);
	if (!body) return "";

	if (mode === "transcript") {
		return `------------\n${role === "user" ? "User" : "Assistant"}:\n\n------------\n\n${body}`;
	}
	return `## ${messageRole(message)}\n\n${body}`;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function headerToMarkdown(header: SessionHeader | null, mode: OutputMode): string {
	if (!header) return "";
	if (mode === "transcript") return "";
	if (mode === "annotated") return header.title ? `# ${header.title}` : "# Session";
	const lines = [`- **Session:** \`${header.id}\``, `- **Working directory:** \`${header.cwd}\``];
	if (header.title) lines.unshift(`- **Title:** ${header.title}`);
	if (header.timestamp) lines.push(`- **Started:** ${header.timestamp}`);
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Sub-sessions
// ---------------------------------------------------------------------------

function subSessionToMarkdown(key: string, subSession: SubSession, mode: OutputMode, withImages: boolean): string {
	const body = subSession.entries
		.map(entry => entryToMarkdown(entry, mode, withImages))
		.filter(Boolean)
		.join("\n\n");
	if (mode === "transcript") return body;
	const header = subSession.header ? headerToMarkdown(subSession.header, mode) : "";
	return `## 🧑‍💻 Subagent: ${key}\n\n${header}${header && body ? "\n\n" : ""}${body || "_(empty transcript)_"}`;
}

export function renderSubSessions(
	subSessions: Record<string, SubSession>,
	mode: OutputMode,
	withImages = false,
): string[] {
	const rendered = Object.entries(subSessions)
		.map(([key, subSession]) => subSessionToMarkdown(key, subSession, mode, withImages))
		.filter(Boolean);
	if (mode === "transcript" || rendered.length === 0) return rendered;
	return ["# 🧑‍💻 Subagent transcripts", ...rendered];
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const KNOWN_FLAGS: Record<string, true> = {
	"--annotated": true,
	"--verbose": true,
	"--with-subagents": true,
	"--subs": true,
	"--with-images": true,
};

export function parseExportArgs(args: string): ExportOptions {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	const unknownFlag = parts.find(part => part.startsWith("--") && !KNOWN_FLAGS[part]);
	if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);

	const annotated = parts.includes("--annotated");
	const verbose = parts.includes("--verbose");
	if (annotated && verbose) throw new Error("Choose either --annotated or --verbose, not both");

	const withSubagents = parts.includes("--with-subagents") || parts.includes("--subs");
	const withImages = parts.includes("--with-images");
	if (withImages && !verbose) throw new Error("--with-images requires --verbose");

	const mode: OutputMode = annotated ? "annotated" : verbose ? "verbose" : "transcript";
	const paths = parts.filter(part => !KNOWN_FLAGS[part]);
	if (paths.length > 1) {
		throw new Error("Usage: /export-md [--annotated | --verbose [--with-images]] [--with-subagents] [path]");
	}

	return { outputPath: paths[0], mode, withSubagents, withImages };
}

function defaultOutputPath(sessionFile: string): string {
	return `${DEFAULT_FILE_PREFIX}${path.basename(sessionFile, ".jsonl")}.md`;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

async function exportMarkdown(args: string, ctx: ExtensionCommandContext): Promise<string> {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) throw new Error("Cannot export an in-memory session");

	const opts = parseExportArgs(args);
	const outputPath = opts.outputPath ?? defaultOutputPath(sessionFile);
	const header = headerToMarkdown(ctx.sessionManager.getHeader(), opts.mode);
	const entries = ctx.sessionManager
		.getBranch()
		.map(entry => entryToMarkdown(entry, opts.mode, opts.withImages))
		.filter(Boolean)
		.join("\n\n");
	const sections = [header, entries];

	const includeSubagents = opts.mode === "verbose" || opts.withSubagents;
	if (includeSubagents) {
		const subSessions = await collectSubSessions(sessionFile);
		sections.push(...renderSubSessions(subSessions, opts.mode, opts.withImages));
	}

	await Bun.write(outputPath, `${sections.filter(Boolean).join("\n\n")}\n`);
	return outputPath;
}

// ---------------------------------------------------------------------------
// Extension registration
// ---------------------------------------------------------------------------

const COMMAND_FLAGS: Array<{ value: string; label: string; description: string }> = [
	{ value: "--annotated", label: "--annotated", description: "Add session title, role headings, icons, and thinking" },
	{ value: "--verbose", label: "--verbose", description: "Full detail — tool calls, metadata, subagents" },
	{ value: "--with-subagents", label: "--with-subagents", description: "Include subagent transcripts" },
	{ value: "--subs", label: "--subs", description: "Shorthand for --with-subagents" },
	{ value: "--with-images", label: "--with-images", description: "Embed inline images in verbose output" },
];

export default function exportMarkdownExtension(pi: ExtensionAPI) {
	pi.registerCommand(COMMAND_NAME, {
		description: "Export a transcript to Markdown (--annotated for thinking, --verbose for full details)",
		getArgumentCompletions: (prefix: string) => {
			if (!prefix.startsWith("--")) return null;
			return COMMAND_FLAGS.filter(flag => flag.value.startsWith(prefix));
		},
		handler: async (args, ctx) => {
			try {
				const outputPath = await exportMarkdown(args, ctx);
				ctx.ui.notify(`Session exported to: ${outputPath}`, "info");
			} catch (error) {
				ctx.ui.notify(`Failed to export session: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}
