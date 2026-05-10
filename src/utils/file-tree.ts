export interface FileTreeNode {
  name: string;
  path: string; // full path relative to workspace root
  isDirectory: boolean;
  children: FileTreeNode[];
}

function sortTreeInPlace(node: FileTreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const child of node.children) {
    if (child.isDirectory) sortTreeInPlace(child);
  }
}

/**
 * Build a tree representation of a flat list of relative file paths.
 * Directories are sorted before files; siblings are sorted alphabetically.
 */
export function buildFileTree(paths: string[]): FileTreeNode {
  const root: FileTreeNode = {
    name: "",
    path: "",
    isDirectory: true,
    children: [],
  };

  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    if (segments.length > 0) {
      let cursor = root;
      let prefix = "";

      for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        prefix = prefix ? `${prefix}/${segment}` : segment;
        const isLast = i === segments.length - 1;
        const existing = cursor.children.find(
          (child) => child.name === segment,
        );

        if (existing) {
          cursor = existing;
        } else {
          const node: FileTreeNode = {
            name: segment,
            path: prefix,
            isDirectory: !isLast,
            children: [],
          };
          cursor.children.push(node);
          cursor = node;
        }
      }
    }
  }

  sortTreeInPlace(root);
  return root;
}
