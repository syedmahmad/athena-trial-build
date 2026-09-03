import { FlashcardDeckView } from "@/components/flashcards/flashcard-deck-view";

export default async function FlashcardsPage({
  params,
}: {
  params: Promise<{ topicSlug: string; subtopicSlug: string }>;
}) {
  const { topicSlug, subtopicSlug } = await params;
  return (
    <FlashcardDeckView topicSlug={topicSlug} subtopicSlug={subtopicSlug} />
  );
}
