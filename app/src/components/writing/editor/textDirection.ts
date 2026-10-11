import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PmNode } from '@tiptap/pm/model';
import { firstStrong, paragraphDirection, type Direction } from '../../../utils/writing/rtl';

/** Blocks that read in their own direction. */
const TEXT_BLOCKS = ['paragraph', 'heading', 'caption'];
/** Blocks whose layout (marker side, column order, bar) follows the direction of what they hold. */
const CONTAINERS = ['bulletList', 'orderedList', 'blockquote', 'table'];
const TYPES = [...TEXT_BLOCKS, ...CONTAINERS];

declare module '@tiptap/core' {
  interface Storage {
    textDirection: { base: Direction };
  }
  interface Commands<ReturnType> {
    textDirection: {
      /** Sets the reading direction of the selected blocks (null follows their first strong letter). */
      setTextDirection: (direction: Direction | null) => ReturnType;
    };
  }
}

/**
 * Per-block reading direction, the way Word and Google Docs do it: every
 * paragraph, heading and caption reads in the direction of its first strong
 * letter (or the one the author set), and lists, quotes and tables take the
 * direction of what they hold, so bullets, bars and columns sit on the
 * right side. The resolved direction is written to the DOM as `dir`; the
 * document stores only an author's explicit choice (`attrs.dir`).
 */
export const TextDirection = Extension.create({
  name: 'textDirection',

  addStorage() {
    // The direction of a block with no letters of its own (an empty paragraph, a number): the document's.
    return { base: 'ltr' as Direction };
  },

  addGlobalAttributes() {
    return [{
      types: TYPES,
      attributes: {
        dir: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = element.getAttribute('dir');
            return value === 'rtl' || value === 'ltr' ? value : null;
          },
          // The plugin writes the resolved direction; the attribute itself is only the author's choice.
          renderHTML: () => ({}),
        },
      },
    }];
  },

  addCommands() {
    return {
      setTextDirection: (direction) => ({ state, tr, dispatch }) => {
        const { from, to } = state.selection;
        let changed = false;
        state.doc.nodesBetween(from, to, (node, pos) => {
          if (!TYPES.includes(node.type.name)) return;
          const attrs: Record<string, unknown> = { ...node.attrs, dir: direction };
          // Like Word's direction buttons: an explicit left or right alignment swaps sides with the direction.
          if (direction && (node.attrs.textAlign === 'left' || node.attrs.textAlign === 'right')) {
            attrs.textAlign = node.attrs.textAlign === 'left' ? 'right' : 'left';
          }
          tr.setNodeMarkup(pos, undefined, attrs);
          changed = true;
        });
        if (changed && dispatch) dispatch(tr);
        return changed;
      },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    /** First-strong direction of a node's own text, or null when it has no letters. Nodes are immutable, so this is stable. */
    const ownCache = new WeakMap<PmNode, Direction | null>();
    const own = (node: PmNode): Direction | null => {
      const cached = ownCache.get(node);
      if (cached !== undefined) return cached;
      const text = node.textContent;
      const value = firstStrong(text) === null ? null : paragraphDirection(text);
      ownCache.set(node, value);
      return value;
    };

    const firstTextBlock = (node: PmNode): PmNode | null => {
      let found: PmNode | null = null;
      node.descendants((child) => {
        if (found) return false;
        if (child.isTextblock) {
          found = child;
          return false;
        }
        return true;
      });
      return found;
    };

    return [
      new Plugin({
        key: new PluginKey('wrTextDirection'),
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = [];
            const resolved = new WeakMap<PmNode, Direction>();
            const base = storage.base;
            state.doc.descendants((node, pos, parent) => {
              const inherited = (parent && resolved.get(parent)) || base;
              let direction: Direction = inherited;
              if (TEXT_BLOCKS.includes(node.type.name)) {
                const chosen = node.attrs.dir === 'rtl' || node.attrs.dir === 'ltr' ? node.attrs.dir as Direction : null;
                direction = chosen ?? own(node) ?? inherited;
              } else if (CONTAINERS.includes(node.type.name)) {
                const chosen = node.attrs.dir === 'rtl' || node.attrs.dir === 'ltr' ? node.attrs.dir as Direction : null;
                const lead = firstTextBlock(node);
                const leadChosen = lead && (lead.attrs.dir === 'rtl' || lead.attrs.dir === 'ltr') ? lead.attrs.dir as Direction : null;
                direction = chosen ?? leadChosen ?? (lead ? own(lead) : null) ?? inherited;
              } else {
                resolved.set(node, inherited);
                return true;
              }
              resolved.set(node, direction);
              decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: direction }));
              return true;
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
