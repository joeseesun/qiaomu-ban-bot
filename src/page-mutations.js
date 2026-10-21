// Shadow hosts are extension-owned. Inserting/removing them must not make
// sibling content scripts rescan X, even when they live inside a tweet.
const HOST = '.qb-host,.qb-hot-host,.qx-interest-host,.qx-author-host,.qx-nav-host,.qx-search-sidebar,.qm-mentions-host,.qm-bookmarks-host';
export function pageMutation(records, selector) {
  return records.some(record => {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest(HOST)) return false;
    if (record.type !== 'childList') return Boolean(target?.closest(selector));
    const nodes = [...record.addedNodes, ...record.removedNodes].filter(node => !(node.nodeType === 1 && node.matches(HOST)));
    if (!nodes.length) return false;
    if (target?.closest(selector)) return true;
    return nodes.some(node => node.nodeType === 1 && (node.matches(selector) || node.querySelector(selector)));
  });
}
