import { useState } from 'react';
import type { TreeNode } from '../../lib/wiki';

export interface FileTreeProps {
  nodes: TreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
  depth?: number;
}

/** Recursive Markdown file tree (arborescence), styled like the Markdit sidebar. */
export function FileTree({ nodes, activePath, onSelect, depth = 1 }: FileTreeProps): JSX.Element {
  return (
    <ul className="markdit-tree" role={depth === 1 ? 'tree' : 'group'}>
      {nodes.map((node) =>
        node.kind === 'dir' ? (
          <DirRow
            key={node.path}
            node={node}
            activePath={activePath}
            onSelect={onSelect}
            depth={depth}
          />
        ) : (
          <li key={node.path} role="treeitem" aria-selected={activePath === node.path}>
            <button
              type="button"
              className={`markdit-tree-row markdit-tree-file${
                node.fileType === 'excalidraw' ? ' markdit-tree-excalidraw' : ''
              }${activePath === node.path ? ' is-active' : ''}`}
              style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
              title={node.name}
              onClick={() => onSelect(node.path)}
            >
              {node.fileType === 'excalidraw' && (
                <span className="markdit-tree-badge" aria-hidden="true">
                  ✎
                </span>
              )}
              {node.name.replace(/\.(excalidraw|md|markdown|mdown|mkd)$/i, '')}
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

interface DirRowProps {
  node: TreeNode;
  activePath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}

function DirRow({ node, activePath, onSelect, depth }: DirRowProps): JSX.Element {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <li role="treeitem" aria-expanded={!collapsed}>
      <button
        type="button"
        className="markdit-tree-row markdit-tree-dir"
        style={{ paddingLeft: `${depth * 0.75 + 0.25}rem` }}
        title={node.name}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span> {node.name}
      </button>
      {!collapsed && node.children && (
        <FileTree
          nodes={node.children}
          activePath={activePath}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </li>
  );
}
