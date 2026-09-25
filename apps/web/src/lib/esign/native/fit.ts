export type Box = { x: number; y: number; w: number; h: number };

/** Largest box of `aspect` (width / height) that fits inside `box`, centered. */
export function fitContain(box: Box, aspect: number): Box {
  if (
    !Number.isFinite(aspect) || aspect <= 0 ||
    !Number.isFinite(box.w) || !Number.isFinite(box.h) ||
    box.w <= 0 || box.h <= 0
  ) {
    throw new Error("Invalid signature fit.");
  }
  const boxAspect = box.w / box.h;
  if (boxAspect > aspect) {
    const w = box.h * aspect;
    return { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
  }
  const h = box.w / aspect;
  return { x: box.x, y: box.y + (box.h - h) / 2, w: box.w, h };
}

/**
 * Same fit as a CSS `object-contain` image inside a field overlay.
 * Field x/y/w/h are fractions of the displayed page. The result is in
 * page points, top-left origin, so the bake step can convert Y for pdf-lib.
 */
export function fitContainOnPage(
  field: { x: number; y: number; w: number; h: number },
  pageWidth: number,
  pageHeight: number,
  markAspect: number,
): Box {
  if (pageWidth <= 0 || pageHeight <= 0) throw new Error("Invalid signature fit.");
  return fitContain(
    {
      x: field.x * pageWidth,
      y: field.y * pageHeight,
      w: field.w * pageWidth,
      h: field.h * pageHeight,
    },
    markAspect,
  );
}
