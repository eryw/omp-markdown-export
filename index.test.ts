import { describe, expect, it } from "bun:test";
import type { SessionEntry } from "@oh-my-pi/pi-coding-agent";
import type { SubSession } from "./index";
import { contentToMarkdown, entryToMarkdown, loadSubSessionCollector, parseExportArgs, renderSubSessions } from "./index";

function messageEntry(role: "user" | "assistant" | "toolResult", content: string): SessionEntry {
	return {
		type: "message",
		id: `${role}-entry`,
		parentId: null,
		timestamp: "2026-09-04T00:00:00.000Z",
		message: { role, content },
	} as SessionEntry;
}

describe("OMP sub-session API detection", () => {
	const htmlModulePath = "@oh-my-pi/pi-coding-agent/export/html";
	const sessionModulePath = "@oh-my-pi/pi-coding-agent/session/sub-sessions";
	const htmlRecords = {
		Html: { agentId: "Html", parent: null, header: null, entries: [], leafId: null },
	};
	const sessionRecords = {
		Session: { agentId: "Session", parent: null, header: null, entries: [], leafId: null },
	};

	it("uses collectSubSessions from the HTML export module when available", async () => {
		const collector = await loadSubSessionCollector(async modulePath =>
			modulePath === htmlModulePath ? { collectSubSessions: async () => htmlRecords } : undefined,
		);

		expect(await collector("session.jsonl")).toEqual(htmlRecords);
	});

	it("falls back to the session module when HTML no longer exports the helper", async () => {
		const collector = await loadSubSessionCollector(async modulePath => {
			if (modulePath === htmlModulePath) return {};
			if (modulePath === sessionModulePath) return { collectSubSessions: async () => sessionRecords };
			return undefined;
		});

		expect(await collector("session.jsonl")).toEqual(sessionRecords);
	});

	it("fails clearly when neither module exports the helper", async () => {
		await expect(
			loadSubSessionCollector(async modulePath =>
				modulePath === htmlModulePath || modulePath === sessionModulePath ? {} : undefined,
			),
		).rejects.toThrow("OMP does not expose collectSubSessions in either supported module");
	});
});

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

	it("labels internal prompts as Agent in subagent transcripts", () => {
		const subSession: SubSession = {
			agentId: "Reviewer",
			parent: null,
			header: null,
			entries: [messageEntry("user", "Review the implementation."), messageEntry("assistant", "I found one issue.")],
			leafId: "assistant-entry",
		};

		expect(renderSubSessions({ Reviewer: subSession }, "transcript")).toEqual([
			"------------\nAgent:\n\n------------\n\nReview the implementation.\n\n------------\nAssistant:\n\n------------\n\nI found one issue.",
		]);
	});
});
