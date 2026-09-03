import { MathContent } from "@/components/quiz/math-content";
import type {
  CachedReportPayload,
  FlashcardForPrint,
} from "@/lib/reports/types";

type FlashcardReportProps = {
  payload: Extract<CachedReportPayload, { kind: "flashcard" }>;
};

const CARDS_PER_PAGE = 8;
const COLS = 2;

/** Chunk cards into pages of exactly CARDS_PER_PAGE; pad the final page
 *  with empty slots so the cut grid stays uniform. */
function chunkCards(cards: FlashcardForPrint[]): (FlashcardForPrint | null)[][] {
  const pages: (FlashcardForPrint | null)[][] = [];
  for (let i = 0; i < cards.length; i += CARDS_PER_PAGE) {
    const page: (FlashcardForPrint | null)[] = cards.slice(i, i + CARDS_PER_PAGE);
    while (page.length < CARDS_PER_PAGE) page.push(null);
    pages.push(page);
  }
  return pages;
}

/** Reorder a page of cards so that after a duplex flip along the long
 *  edge, the back of each cell aligns with its front. Reverses the
 *  column index inside each row. */
function mirrorForBack(
  page: (FlashcardForPrint | null)[],
): (FlashcardForPrint | null)[] {
  const out: (FlashcardForPrint | null)[] = [];
  const rows = page.length / COLS;
  for (let r = 0; r < rows; r++) {
    const row = page.slice(r * COLS, r * COLS + COLS);
    out.push(...row.reverse());
  }
  return out;
}

export function FlashcardReport({ payload }: FlashcardReportProps) {
  const { deck } = payload;
  const pages = chunkCards(deck.cards);

  return (
    <div className="flashcard-report" data-report-ready>
      <style>{PRINT_CSS}</style>

      {pages.map((page, pageIdx) => {
        const back = mirrorForBack(page);
        const isLastPage = pageIdx === pages.length - 1;
        return (
          <FlashcardPagePair
            key={pageIdx}
            front={page}
            back={back}
            pageIndex={pageIdx}
            totalPages={pages.length}
            isLast={isLastPage}
            deckLabel={`${deck.topicName} · ${deck.subtopicName}`}
          />
        );
      })}
    </div>
  );
}

function FlashcardPagePair({
  front,
  back,
  pageIndex,
  totalPages,
  isLast,
  deckLabel,
}: {
  front: (FlashcardForPrint | null)[];
  back: (FlashcardForPrint | null)[];
  pageIndex: number;
  totalPages: number;
  isLast: boolean;
  deckLabel: string;
}) {
  return (
    <>
      <FlashcardSheet
        cards={front}
        side="front"
        pageLabel={`Page ${pageIndex + 1} of ${totalPages} · fronts`}
        deckLabel={deckLabel}
      />
      <FlashcardSheet
        cards={back}
        side="back"
        pageLabel={`Page ${pageIndex + 1} of ${totalPages} · backs`}
        deckLabel={deckLabel}
        isFinal={isLast}
      />
    </>
  );
}

function FlashcardSheet({
  cards,
  side,
  pageLabel,
  deckLabel,
  isFinal,
}: {
  cards: (FlashcardForPrint | null)[];
  side: "front" | "back";
  pageLabel: string;
  deckLabel: string;
  isFinal?: boolean;
}) {
  return (
    <section
      className="flashcard-sheet"
      data-side={side}
      data-final={isFinal ? "1" : undefined}
    >
      <header className="flashcard-sheet-header">
        <span>{deckLabel}</span>
        <span>{pageLabel}</span>
      </header>
      <div className="flashcard-grid">
        {cards.map((card, i) => (
          <FlashcardCell key={i} card={card} side={side} />
        ))}
      </div>
    </section>
  );
}

function FlashcardCell({
  card,
  side,
}: {
  card: FlashcardForPrint | null;
  side: "front" | "back";
}) {
  if (!card) {
    return <div className="flashcard-cell flashcard-cell--empty" aria-hidden />;
  }
  return (
    <div className="flashcard-cell" data-side={side}>
      {side === "front" ? <CellFront card={card} /> : <CellBack card={card} />}
    </div>
  );
}

function CellFront({ card }: { card: FlashcardForPrint }) {
  return (
    <>
      <div className="flashcard-cell-head">
        <span className="flashcard-cell-tag">QUESTION</span>
        <span className="flashcard-cell-diff">{card.difficulty}</span>
      </div>
      <div className="flashcard-cell-body flashcard-cell-body--front">
        <MathContent content={card.questionText} size="sm" />
      </div>
    </>
  );
}

function CellBack({ card }: { card: FlashcardForPrint }) {
  const answerText =
    card.options.find((o) => o.letter === card.correctLetter)?.text ?? null;
  return (
    <>
      <div className="flashcard-cell-head">
        <span className="flashcard-cell-tag">ANSWER</span>
      </div>
      {answerText && (
        <div className="flashcard-cell-answer-box">
          <MathContent content={answerText} size="base" />
        </div>
      )}
      <div className="flashcard-cell-body">
        <MathContent content={card.explanation} size="sm" />
      </div>
      {card.solutionSteps.length > 0 && (
        <ol className="flashcard-cell-steps">
          {card.solutionSteps.slice(0, 3).map((s, i) => (
            <li key={i}>
              <MathContent content={s} size="sm" />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** Print-only CSS. Sized for Avery 8-up on US Letter: a 2×4 grid with
 *  3.75"×2.5" cells, 0.25" page margins, no inner gutter. Duplex along
 *  the long edge — back pages are pre-mirrored above so card positions
 *  align after the flip. The whole stylesheet is scoped to this report
 *  via the `.flashcard-report` class so it doesn't bleed into other
 *  /reports/print/* renderers. */
const PRINT_CSS = `
.flashcard-report {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #111;
  background: #fff;
}

@page {
  size: 8.5in 11in;
  margin: 0;
}

.flashcard-sheet {
  width: 8.5in;
  height: 11in;
  padding: 0.25in;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  break-after: page;
}
.flashcard-sheet[data-final="1"] {
  page-break-after: auto;
  break-after: auto;
}

.flashcard-sheet-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8pt;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #777;
  padding: 0 0.05in 0.06in;
  border-bottom: 1px dashed #d9d9d9;
}

.flashcard-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 3.75in);
  grid-template-rows: repeat(4, 2.5in);
  gap: 0;
  margin-top: 0.06in;
  width: 7.5in;
  align-self: center;
}

.flashcard-cell {
  width: 3.75in;
  height: 2.5in;
  padding: 0.18in 0.22in;
  box-sizing: border-box;
  border: 1px dashed #cfcfcf;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.04in;
  font-size: 9pt;
  line-height: 1.32;
}
.flashcard-cell--empty {
  border-style: dashed;
  border-color: #ececec;
}

.flashcard-cell-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 7pt;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #888;
}
.flashcard-cell-tag {
  color: #999;
}
.flashcard-cell-diff {
  color: #6b7280;
}

.flashcard-cell-body {
  font-size: 9pt;
  color: #111;
  flex: 1 1 auto;
  overflow: hidden;
}
.flashcard-cell-body--front {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11pt;
  text-align: center;
}
.flashcard-cell-body--front .prose {
  font-size: 11pt !important;
}
.flashcard-cell-answer-box {
  margin: 0.04in 0 0.06in;
  padding: 0.04in 0.08in;
  border-left: 2pt solid #111;
  font-size: 11pt;
  font-weight: 500;
}
.flashcard-cell-answer-box .prose {
  font-size: 11pt !important;
  margin: 0 !important;
}
.flashcard-cell-body .prose {
  font-size: 9pt !important;
  margin: 0 !important;
}
.flashcard-cell-body p {
  margin: 0 0 0.04in 0;
}

.flashcard-cell-steps {
  list-style: decimal;
  padding-left: 0.2in;
  margin: 0.04in 0 0;
  font-size: 8pt;
  line-height: 1.28;
}
.flashcard-cell-steps li {
  margin: 0 0 0.02in 0;
}

/* KaTeX scales independently of font-size; pin it to the cell body
   size so equations don't blow out of their cells. */
.flashcard-cell .katex {
  font-size: 1em;
}
`;
