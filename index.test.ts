import { describe, expect, it } from "bun:test";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import type { SubSession } from "@oh-my-pi/pi-coding-agent/export/html";
import { contentToMarkdown, entryToMarkdown, parseExportArgs, renderSubSessions } from "./index";

function messageEntry(role: "user" | "assistant" | "toolResult", content: string): SessionEntry {
	return {
		type: "message",
		id: `${role}-entry`,
		parentId: null,
		timestamp: "2026-09-04T00:00:00.000Z",
		message: { role, content },
	} as SessionEntry;
}

describe("export-md arguments", () => {
	it("defaults to transcript output", () => {
		expect(parseExportArgs("")).toEqual({
			outputPath: undefined,
			mode: "transcript",
			withSubagents: false,
			withImages: false,
		});
	});

	it("selects annotated output explicitly", () => {
		expect(parseExportArgs("--annotated output.md")).toEqual({
			outputPath: "output.md",
			mode: "annotated",
			withSubagents: false,
			withImages: false,
		});
	});

	it("rejects conflicting output modes", () => {
		expect(() => parseExportArgs("--annotated --verbose")).toThrow("Choose either --annotated or --verbose");
	});

	it("rejects unknown flags instead of treating them as paths", () => {
		expect(() => parseExportArgs("--verbsoe")).toThrow("Unknown option: --verbsoe");
	});

	it("rejects the removed raw flag", () => {
		expect(() => parseExportArgs("--raw")).toThrow("Unknown option: --raw");
	});

	it("requires verbose mode when embedding images", () => {
		expect(() => parseExportArgs("--with-images")).toThrow("--with-images requires --verbose");
		expect(parseExportArgs("output.md --verbose --with-images")).toEqual({
			outputPath: "output.md",
			mode: "verbose",
			withSubagents: false,
			withImages: true,
		});
	});
});

describe("export-md serialization", () => {
	it("quotes thinking so nested Markdown fences cannot close its container", () => {
		const markdown = contentToMarkdown(
			[{ type: "thinking", thinking: "inspect\n```typescript\nconst value = true;\n```\nfinished" }],
			"annotated",
		);
		expect(markdown).toBe(
			"> 🧠 **Thinking**\n>\n> inspect\n> ```typescript\n> const value = true;\n> ```\n> finished",
		);
	});

	it("delimits speaker labels while excluding non-conversation messages in transcript mode", () => {
		expect(entryToMarkdown(messageEntry("user", "question"), "transcript")).toBe(
			"------------\nUser:\n\n------------\n\nquestion",
		);
		expect(entryToMarkdown(messageEntry("assistant", "answer"), "transcript")).toBe(
			"------------\nAssistant:\n\n------------\n\nanswer",
		);
		expect(entryToMarkdown(messageEntry("toolResult", "private tool output"), "transcript")).toBe("");
	});

	it("omits verbose image payloads unless explicitly enabled", () => {
		const image = [{ type: "image", mimeType: "image/png", data: "YWJj" }];
		expect(contentToMarkdown(image, "verbose")).toContain("Image omitted");
		expect(contentToMarkdown(image, "verbose", true)).toBe("![image](data:image/png;base64,YWJj)");
	});

	it("keeps transcript subagent output free of headings and metadata", () => {
		const subSession: SubSession = {
			agentId: "Reviewer",
			parent: null,
			header: {
				type: "session",
				id: "sub-session",
				timestamp: "2026-09-04T00:00:00.000Z",
				cwd: "/private/workspace",
			},
			entries: [messageEntry("assistant", "subagent answer")],
			leafId: "assistant-entry",
		};

		expect(renderSubSessions({ Reviewer: subSession }, "transcript")).toEqual([
			"------------\nAssistant:\n\n------------\n\nsubagent answer",
		]);
	});
});
