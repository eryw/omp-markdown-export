# OMP Markdown Export

An [OMP](https://omp.sh/) extension that exports the current session branch as Markdown.

The extension registers the `/export-md` slash command and provides three output modes:

- **Compact** by default: session title, user messages, assistant messages, and thinking blocks.
- **Raw** with `--raw`: only user and assistant text, without headings, icons, thinking, tool results, or metadata.
- **Verbose** with `--verbose`: session metadata, thinking, tool calls, tool results, state changes, and subagent transcripts.

## Installation

Install the published package by its npm name:

```bash
omp install omp-markdown-export
```

For local development, install the dependencies:

```bash
bun install
```

Load the local extension for one OMP session:

```bash
omp --extension /absolute/path/to/export-markdown
```

Alternatively, link the local package as a plugin:

```bash
omp plugin link /absolute/path/to/export-markdown
```

Equivalent local-path install:

```bash
omp install /absolute/path/to/export-markdown
```

You can also add the local package path to the `extensions` list in your OMP
configuration. Start a new OMP session after changing the extension source.

## Usage

Export a compact transcript to the default filename:

```text
/export-md
```

The default filename is:

```text
omp-session-<session-id>.md
```

Choose an output path:

```text
/export-md conversation.md
```

Paths are whitespace-delimited; paths containing spaces are not supported.

### Compact output

```text
/export-md [path]
```

Example:

```markdown
# Session title

## 👤 User

Can you inspect this implementation?

## 🤖 Assistant

> 🧠 **Thinking**
>
> I should inspect the relevant files first.

The implementation has two important edge cases.
```

Compact mode excludes tool calls, tool results, state-change entries, images, and subagent transcripts by default.

Include subagent transcripts without enabling all verbose details:

```text
/export-md --with-subagents conversation.md
/export-md --subs conversation.md
```

### Raw output

```text
/export-md --raw conversation.txt
```

Raw mode emits only user and assistant text. It is suitable for piping into other programs or producing an unformatted transcript.

Subagent text can be included while remaining raw:

```text
/export-md --raw --with-subagents conversation.txt
```

### Verbose output

```text
/export-md --verbose diagnostic.md
```

Verbose mode includes:

- session metadata;
- thinking blocks;
- tool calls and JSON arguments;
- tool results;
- compaction and branch summaries;
- model, thinking-level, and service-tier changes;
- labels and context resets;
- extension messages;
- subagent transcripts.

Inline image payloads are omitted by default because base64 data can make the document very large. Embed them explicitly with:

```text
/export-md --verbose --with-images diagnostic.md
```

`--with-images` requires `--verbose`.

## Options

| Option | Effect |
| --- | --- |
| `--raw` | Export unformatted user and assistant text only. |
| `--verbose` | Export the complete diagnostic transcript. |
| `--with-subagents` | Include nested subagent transcripts outside verbose mode. |
| `--subs` | Alias for `--with-subagents`. |
| `--with-images` | Embed base64 images in verbose output. |

`--raw` and `--verbose` are mutually exclusive. Unknown options are rejected instead of being interpreted as output paths.

## Privacy

The generated file remains local; this extension does not upload it. Exported content may contain prompts, reasoning, source code, file paths, tool output, credentials, or other sensitive data. Review the file before sharing it.

## Development

Run the focused regression tests:

```bash
bun test index.test.ts
```

Check that the extension bundles:

```bash
bun build index.ts --outdir /tmp/omp-export-md-check --external '@oh-my-pi/*'
```
