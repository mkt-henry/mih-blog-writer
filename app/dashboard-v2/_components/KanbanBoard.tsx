import type { KanbanGroups } from "@/lib/articles";
import { AGENCIES, AGENCY_SLUGS } from "@/lib/agencies";
import KanbanColumn from "./KanbanColumn";

type Props = { groups: KanbanGroups; onOpen: (id: string) => void };

export default function KanbanBoard({ groups, onOpen }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3 p-4">
      {AGENCY_SLUGS.map((slug) => (
        <KanbanColumn key={slug} agency={slug} agencyInfo={AGENCIES[slug]} group={groups[slug]} onOpen={onOpen} />
      ))}
    </div>
  );
}
