export const mainWindowSize = { width: 1150, height: 790, minWidth: 640, minHeight: 450 };
export const sidebarSize = { min: 212, max: 372, initial: 242 };

export function normalizeSidebarWidth(width) {
  return Number.isFinite(width)
    ? Math.round(Math.min(sidebarSize.max, Math.max(sidebarSize.min, width)))
    : sidebarSize.initial;
}

export function isWindowBounds(bounds) {
  return Boolean(bounds && ['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(bounds[key]))
    && bounds.width > 0 && bounds.height > 0);
}

export function fitMainWindow(bounds, workArea) {
  const minWidth = Math.min(mainWindowSize.minWidth, workArea.width);
  const minHeight = Math.min(mainWindowSize.minHeight, workArea.height);
  const width = Math.min(workArea.width, Math.max(minWidth, bounds?.width ?? mainWindowSize.width));
  const height = Math.min(workArea.height, Math.max(minHeight, bounds?.height ?? mainWindowSize.height));
  const x = bounds ? Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - width)) :
    workArea.x + Math.round((workArea.width - width) / 2);
  const y = bounds ? Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height)) :
    workArea.y + Math.round((workArea.height - height) / 2);
  return { x, y, width, height, minWidth, minHeight };
}
