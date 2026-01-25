function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;')
}

interface ParsedSegment {
	type: 'text' | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'code' | 'codeblock' | 'spoiler' | 'blockquote' | 'url' | 'maskedLink' | 'subtext' | 'timestamp' | 'mention' | 'emoji'
	content: string | ParsedSegment[]
	language?: string
	url?: string
	timestamp?: string
	timestampStyle?: string
	mentionType?: string
	mentionColor?: string
	emojiName?: string
	emojiId?: string
	emojiAnimated?: boolean
}

function parseInlineFormatting(text: string, depth: number = 0): ParsedSegment[] {
	if (depth > 10) {
		return [{ type: 'text', content: text }]
	}

	const segments: ParsedSegment[] = []
	let i = 0

	while (i < text.length) {
		if (text.substr(i, 3) === '***' || text.substr(i, 3) === '___') {
			const delimiter = text.substr(i, 3)
			const endIndex = text.indexOf(delimiter, i + 3)
			if (endIndex !== -1 && endIndex > i + 3) {
				const content = text.substring(i + 3, endIndex)
				segments.push({
					type: 'bold',
					content: [{
						type: 'italic',
						content: parseInlineFormatting(content, depth + 1)
					}]
				})
				i = endIndex + 3
				continue
			}
		}

		if (text.substr(i, 2) === '**') {
			const endIndex = text.indexOf('**', i + 2)
			if (endIndex !== -1 && endIndex > i + 2) {
				const content = text.substring(i + 2, endIndex)
				segments.push({
					type: 'bold',
					content: parseInlineFormatting(content, depth + 1)
				})
				i = endIndex + 2
				continue
			}
		}

		if (text.substr(i, 2) === '__') {
			const endIndex = text.indexOf('__', i + 2)
			if (endIndex !== -1 && endIndex > i + 2) {
				const content = text.substring(i + 2, endIndex)
				segments.push({
					type: 'underline',
					content: parseInlineFormatting(content, depth + 1)
				})
				i = endIndex + 2
				continue
			}
		}

		if (text[i] === '*' && text[i - 1] !== '*' && text[i + 1] !== '*') {
			const endIndex = text.indexOf('*', i + 1)
			if (endIndex !== -1 && endIndex > i + 1 && text[endIndex + 1] !== '*') {
				const content = text.substring(i + 1, endIndex)
				segments.push({
					type: 'italic',
					content: parseInlineFormatting(content, depth + 1)
				})
				i = endIndex + 1
				continue
			}
		}

		if (text[i] === '_' && text[i - 1] !== '_' && text[i + 1] !== '_') {
			const endIndex = text.indexOf('_', i + 1)
			if (endIndex !== -1 && endIndex > i + 1 && text[endIndex + 1] !== '_') {
				const content = text.substring(i + 1, endIndex)
				segments.push({
					type: 'italic',
					content: parseInlineFormatting(content, depth + 1)
				})
				i = endIndex + 1
				continue
			}
		}

		if (text.substr(i, 2) === '~~') {
			const endIndex = text.indexOf('~~', i + 2)
			if (endIndex !== -1 && endIndex > i + 2) {
				const content = text.substring(i + 2, endIndex)
				segments.push({
					type: 'strikethrough',
					content: parseInlineFormatting(content, depth + 1)
				})
				i = endIndex + 2
				continue
			}
		}

		if (text.substr(i, 2) === '||') {
			const endIndex = text.indexOf('||', i + 2)
			if (endIndex !== -1 && endIndex > i + 2) {
				const content = text.substring(i + 2, endIndex)
				segments.push({
					type: 'spoiler',
					content: parseInlineFormatting(content, depth + 1)
				})
				i = endIndex + 2
				continue
			}
		}

		if (text[i] === '`') {
			const endIndex = text.indexOf('`', i + 1)
			if (endIndex !== -1 && endIndex > i + 1) {
				const content = text.substring(i + 1, endIndex)
				segments.push({
					type: 'code',
					content: content
				})
				i = endIndex + 1
				continue
			}
		}

		const maskedLinkMatch = text.substr(i).match(/^\[([^\]]+)\]\(([^)]+)\)/)
		if (maskedLinkMatch) {
			const linkText = maskedLinkMatch[1]
			const url = maskedLinkMatch[2]
			segments.push({
				type: 'maskedLink',
				content: linkText,
				url: url
			})
			i += maskedLinkMatch[0].length
			continue
		}

		const timestampMatch = text.substr(i).match(/^<t:(-?\d+)(?::([tTdDfFR]))?>/)
		if (timestampMatch) {
			const timestamp = timestampMatch[1]
			const style = timestampMatch[2] || 'f'
			segments.push({
				type: 'timestamp',
				content: '',
				timestamp: timestamp,
				timestampStyle: style
			})
			i += timestampMatch[0].length
			continue
		}

		const emojiMatch = text.substr(i).match(/^<(a)?:([^:]+):(\d+)>/)
		if (emojiMatch) {
			const animated = !!emojiMatch[1]
			const emojiName = emojiMatch[2]
			const emojiId = emojiMatch[3]

			segments.push({
				type: 'emoji',
				content: emojiName,
				emojiName: emojiName,
				emojiId: emojiId,
				emojiAnimated: animated
			})
			i += emojiMatch[0].length
			continue
		}

		const mentionMatch = text.substr(i).match(/^<(@&?|#)([^>]+)>/)
		if (mentionMatch) {
			const prefix = mentionMatch[1]
			const content = mentionMatch[2]
			let mentionType = 'user'

			if (prefix === '@&') {
				mentionType = 'role'
			} else if (prefix === '#') {
				mentionType = 'channel'
			} else if (prefix === '@') {
				mentionType = 'user'
			}

			segments.push({
				type: 'mention',
				content: content,
				mentionType: mentionType
			})
			i += mentionMatch[0].length
			continue
		}

		const urlMatch = text.substr(i).match(/^https?:\/\/[^\s<]+[^<.,:;"')\]\s]/)
		if (urlMatch) {
			const url = urlMatch[0]
			segments.push({
				type: 'url',
				content: url,
				url: url
			})
			i += url.length
			continue
		}

		let textContent = ''
		while (
			i < text.length &&
			text[i] !== '*' &&
			text[i] !== '_' &&
			text[i] !== '~' &&
			text[i] !== '|' &&
			text[i] !== '`' &&
			text[i] !== '[' &&
			text[i] !== '<' &&
			!text.substr(i).match(/^https?:\/\//)
		) {
			textContent += text[i]
			i++
		}

		if (textContent) {
			segments.push({
				type: 'text',
				content: textContent
			})
		} else if (i < text.length) {
			segments.push({
				type: 'text',
				content: text[i]
			})
			i++
		}
	}

	return segments
}

function parseBlocks(text: string): ParsedSegment[] {
	const lines = text.split('\n')
	const blocks: ParsedSegment[] = []
	let i = 0

	while (i < lines.length) {
		const line = lines[i]

		const codeblockMatch = line.match(/^```(\w*)/)
		if (codeblockMatch) {
			const language = codeblockMatch[1] || ''
			let codeContent = ''
			i++
			while (i < lines.length && !lines[i].match(/^```$/)) {
				codeContent += (codeContent ? '\n' : '') + lines[i]
				i++
			}
			blocks.push({
				type: 'codeblock',
				content: codeContent,
				language: language
			})
			i++
			continue
		}

		if (line.match(/^>>> /)) {
			let quoteContent = line.substring(4)
			i++
			while (i < lines.length) {
				quoteContent += '\n' + lines[i]
				i++
			}
			blocks.push({
				type: 'blockquote',
				content: parseInlineFormatting(quoteContent)
			})
			continue
		}

		if (line.match(/^> /)) {
			const quoteLines: string[] = []
			while (i < lines.length && lines[i].match(/^> /)) {
				quoteLines.push(lines[i].substring(2))
				i++
			}
			blocks.push({
				type: 'blockquote',
				content: parseInlineFormatting(quoteLines.join('\n'))
			})
			continue
		}

		const h1Match = line.match(/^# (.+)$/)
		if (h1Match) {
			blocks.push({
				type: 'text',
				content: `<h1 style="font-size: 1.5em; font-weight: 700; margin: 8px 0 4px 0; color: #ffffff;">${escapeHtml(h1Match[1])}</h1>`
			})
			i++
			continue
		}

		const h2Match = line.match(/^## (.+)$/)
		if (h2Match) {
			blocks.push({
				type: 'text',
				content: `<h2 style="font-size: 1.25em; font-weight: 600; margin: 6px 0 4px 0; color: #ffffff;">${escapeHtml(h2Match[1])}</h2>`
			})
			i++
			continue
		}

		const h3Match = line.match(/^### (.+)$/)
		if (h3Match) {
			blocks.push({
				type: 'text',
				content: `<h3 style="font-size: 1.1em; font-weight: 600; margin: 4px 0 4px 0; color: #ffffff;">${escapeHtml(h3Match[1])}</h3>`
			})
			i++
			continue
		}

		const subtextMatch = line.match(/^-# (.+)$/)
		if (subtextMatch) {
			blocks.push({
				type: 'subtext',
				content: parseInlineFormatting(subtextMatch[1])
			})
			i++
			continue
		}

		const ulMatch = line.match(/^[\*\-] (.+)$/)
		if (ulMatch) {
			const listItems: string[] = []
			while (i < lines.length && lines[i].match(/^[\*\-] (.+)$/)) {
				const itemMatch = lines[i].match(/^[\*\-] (.+)$/)
				if (itemMatch) {
					listItems.push(itemMatch[1])
				}
				i++
			}
			blocks.push({
				type: 'text',
				content: `<ul style="margin: 4px 0; padding-left: 20px;">${listItems.map(item => `<li>${segmentsToHtml(parseInlineFormatting(item))}</li>`).join('')}</ul>`
			})
			continue
		}

		const olMatch = line.match(/^\d+\. (.+)$/)
		if (olMatch) {
			const listItems: string[] = []
			while (i < lines.length && lines[i].match(/^\d+\. (.+)$/)) {
				const itemMatch = lines[i].match(/^\d+\. (.+)$/)
				if (itemMatch) {
					listItems.push(itemMatch[1])
				}
				i++
			}
			blocks.push({
				type: 'text',
				content: `<ol style="margin: 4px 0; padding-left: 20px;">${listItems.map(item => `<li>${segmentsToHtml(parseInlineFormatting(item))}</li>`).join('')}</ol>`
			})
			continue
		}

		const inlineSegments = parseInlineFormatting(line)
		blocks.push(...inlineSegments)

		if (i < lines.length - 1) {
			blocks.push({ type: 'text', content: '\n' })
		}

		i++
	}

	return blocks
}

function formatTimestamp(timestamp: string, style: string): string {
	const date = new Date(parseInt(timestamp) * 1000)

	if (isNaN(date.getTime())) {
		return `<t:${timestamp}:${style}>`
	}

	switch (style) {
		case 't':
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
		case 'T':
			return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
		case 'd':
			return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
		case 'D':
			return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
		case 'f':
			return `${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
		case 'F':
			return `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
		case 'R':
			const now = new Date()
			const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

			if (diff < 60) return `${diff} seconds ago`
			if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
			if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
			return `${Math.floor(diff / 86400)} days ago`
		default:
			return date.toLocaleString('en-US')
	}
}

function segmentsToHtml(segments: ParsedSegment[], isStandalone: boolean = false): string {
	const emojiStandalone = isStandalone || (segments.length === 1 && segments[0].type === 'emoji')

	return segments.map(segment => {
		switch (segment.type) {
			case 'bold':
				return `<strong>${segmentsToHtml(segment.content as ParsedSegment[])}</strong>`

			case 'italic':
				return `<em>${segmentsToHtml(segment.content as ParsedSegment[])}</em>`

			case 'underline':
				return `<u>${segmentsToHtml(segment.content as ParsedSegment[])}</u>`

			case 'strikethrough':
				return `<s>${segmentsToHtml(segment.content as ParsedSegment[])}</s>`

			case 'code':
				return `<code>${escapeHtml(segment.content as string)}</code>`

			case 'codeblock':
				const language = segment.language || ''
				return `<pre><code class="language-${escapeHtml(language)}">${escapeHtml(segment.content as string)}</code></pre>`

			case 'spoiler':
				return `<span class="spoiler">${segmentsToHtml(segment.content as ParsedSegment[])}</span>`

			case 'blockquote':
				return `<blockquote>${segmentsToHtml(segment.content as ParsedSegment[])}</blockquote>`

			case 'url':
				return `<a href="${escapeHtml(segment.url!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment.content as string)}</a>`

			case 'maskedLink':
				return `<a href="${escapeHtml(segment.url!)}" target="_blank" rel="noopener noreferrer">${escapeHtml(segment.content as string)}</a>`

			case 'subtext':
				return `<span style="font-size: 0.75em; color: #b9bbbe;">${segmentsToHtml(segment.content as ParsedSegment[])}</span>`

			case 'timestamp':
				return `<span style="background-color: rgba(88, 101, 242, 0.3); padding: 0 2px; border-radius: 3px;">${escapeHtml(formatTimestamp(segment.timestamp!, segment.timestampStyle!))}</span>`

			case 'mention': {
				const mentionType = segment.mentionType || 'user'
				const color = segment.mentionColor || (mentionType === 'role' ? '#5865f2' : '#5865f2')
				const prefix = mentionType === 'user' ? '@' : mentionType === 'role' ? '@' : '#'
				return `<span style="background-color: rgba(88, 101, 242, 0.3); color: ${color}; padding: 0 2px; border-radius: 3px; font-weight: 500;">${prefix}${escapeHtml(segment.content as string)}</span>`
			}

			case 'emoji': {
				const extension = segment.emojiAnimated ? 'gif' : 'png'
				const emojiUrl = `https://cdn.discordapp.com/emojis/${segment.emojiId}.${extension}`
				const size = emojiStandalone ? '46px' : '24px'
				return `<img src="${emojiUrl}" alt=":${escapeHtml(segment.emojiName!)}:" title=":${escapeHtml(segment.emojiName!)}:" style="width: ${size}; height: ${size}; vertical-align: bottom; display: inline-block;" class="discord-custom-emoji" />`
			}

			default:
				return escapeHtml(segment.content as string)
		}
	}).join('')
}

export function parseDiscordMarkdown(text: string): string {
	if (!text) return ''

	const blocks = parseBlocks(text)
	return segmentsToHtml(blocks)
}
