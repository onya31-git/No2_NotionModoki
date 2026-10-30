import type { PageSummary } from "./pb";

export type PageTree = {
  byId: Map<string, PageSummary>;
  /** 表示中のページだけを親 ID ごとに表示順（sort → 作成順）で並べたもの（ルートは ""） */
  children: Map<string, PageSummary[]>;
  /** 自身も祖先もゴミ箱に入っていなければ true */
  isVisible: (id: string) => boolean;
  /** ルート側から順に並べた祖先 */
  ancestors: (id: string) => PageSummary[];
  /** ゴミ箱内を含むすべての子孫 ID */
  descendantIds: (id: string) => string[];
  canMoveInto: (id: string, parent: string) => boolean;
};

export const bySortOrder = (a: PageSummary, b: PageSummary) =>
  (a.sort || 0) - (b.sort || 0) || a.created.localeCompare(b.created);

// 全ページの概要（数百件程度を想定）を一度に取得し、階層はクライアント側で組み立てる。
export function buildTree(list: PageSummary[]): PageTree {
  const byId = new Map(list.map((p) => [p.id, p]));

  const allChildren = new Map<string, PageSummary[]>();
  for (const p of list) {
    const key = p.parent || "";
    const arr = allChildren.get(key);
    if (arr) arr.push(p);
    else allChildren.set(key, [p]);
  }

  const visibleMemo = new Map<string, boolean>();
  const isVisible = (id: string): boolean => {
    const memo = visibleMemo.get(id);
    if (memo !== undefined) return memo;
    visibleMemo.set(id, false); // 循環参照ガード
    const p = byId.get(id);
    const visible = !!p && !p.trashed && (!p.parent || isVisible(p.parent));
    visibleMemo.set(id, visible);
    return visible;
  };

  const children = new Map<string, PageSummary[]>();
  for (const [key, arr] of allChildren) {
    const visible = arr.filter((p) => isVisible(p.id)).sort(bySortOrder);
    if (visible.length) children.set(key, visible);
  }

  const ancestors = (id: string) => {
    const out: PageSummary[] = [];
    const seen = new Set([id]);
    let cur = byId.get(id)?.parent;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const p = byId.get(cur);
      if (!p) break;
      out.unshift(p);
      cur = p.parent;
    }
    return out;
  };

  const descendantIds = (id: string) => {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      for (const c of allChildren.get(stack.pop()!) ?? []) {
        if (c.id === id || out.has(c.id)) continue;
        out.add(c.id);
        stack.push(c.id);
      }
    }
    return [...out];
  };

  /** id を parent の下へ移しても循環しないか */
  const canMoveInto = (id: string, parent: string) =>
    !parent || (parent !== id && !ancestors(parent).some((p) => p.id === id));

  return { byId, children, isVisible, ancestors, descendantIds, canMoveInto };
}
