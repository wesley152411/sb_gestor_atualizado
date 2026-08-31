import Link from 'next/link';
import { getLegalDocument, type LegalDocumentKey } from '@/lib/legal-documents';
import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

type Block = { level: number; text: string; id: string };

function slug(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function headings(markdown: string): Block[] {
  return markdown.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(#{2,3})\s+(.+)$/);
    return match ? [{ level: match[1].length, text: match[2], id: slug(match[2]) }] : [];
  });
}

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part)}</>;
}

function MarkdownBody({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const blocks: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      const Tag = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      blocks.push(<Tag key={i} id={level === 1 ? undefined : slug(text)}><Inline text={text} /></Tag>);
      continue;
    }
    if (/^\*\*.+\*\*$/.test(line)) {
      blocks.push(<p key={i} className="legal-meta"><Inline text={line} /></p>);
      continue;
    }
    if (/^-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^-\s+/.test(lines[i])) items.push(lines[i++].replace(/^-\s+/, ''));
      i--;
      blocks.push(<ul key={i}>{items.map((item, index) => <li key={index}><Inline text={item} /></li>)}</ul>);
      continue;
    }
    if (line.startsWith('|') && lines[i + 1]?.match(/^\|\s*-+/)) {
      const cells = (value: string) => value.split('|').slice(1, -1).map((cell) => cell.trim());
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(cells(lines[i++]));
      i--;
      blocks.push(<div className="legal-table-wrap" key={i}><table><thead><tr>{header.map((cell) => <th key={cell}><Inline text={cell} /></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><Inline text={cell} /></td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    blocks.push(<p key={i}><Inline text={line} /></p>);
  }
  return <>{blocks}</>;
}

export function LegalDocumentPage({ documentKey }: { documentKey: LegalDocumentKey }) {
  const document = getLegalDocument(documentKey);
  const index = headings(document.content);
  return (
    <main className="legal-page">
      <header className="legal-header"><Link href="/" className="legal-brand">SB GESTOR</Link><Link href="/signup">Criar conta</Link></header>
      <div className="legal-shell">
        <aside className="legal-index" aria-label="Índice do documento"><strong>Neste documento</strong>{index.map((item) => <a key={item.id} className={`level-${item.level}`} href={`#${item.id}`}>{item.text}</a>)}</aside>
        <article className="legal-document"><MarkdownBody markdown={document.content} /></article>
      </div>
      <PublicLegalFooter />
    </main>
  );
}
