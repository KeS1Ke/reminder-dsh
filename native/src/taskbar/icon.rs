use std::ffi::c_void;
use std::ptr;

use crate::win32::to_wide;

const PIXEL_FORMAT_32BPP_ARGB: i32 = 0x0026_200A;
const SMOOTHING_MODE_ANTI_ALIAS: i32 = 4;
const TEXT_RENDERING_HINT_ANTI_ALIAS_GRID_FIT: i32 = 3;
const FONT_STYLE_BOLD: i32 = 1;
const UNIT_PIXEL: i32 = 2;
const STRING_ALIGNMENT_CENTER: i32 = 1;
const STRING_FORMAT_FLAGS_NO_WRAP: i32 = 0x0000_1000;
const FILL_MODE_ALTERNATE: i32 = 0;

const CHIP_COLOR_ARGB: u32 = 0xFF26_252D;
const WHITE_ARGB: u32 = 0xFFFF_FFFF;

#[repr(C)]
struct GdiplusStartupInput {
    gdiplus_version: u32,
    debug_event_callback: *const c_void,
    suppress_background_thread: i32,
    suppress_external_codecs: i32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct RectF {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}

#[link(name = "gdiplus")]
extern "system" {
    fn GdiplusStartup(
        token: *mut usize,
        input: *const GdiplusStartupInput,
        output: *mut c_void,
    ) -> i32;
    fn GdiplusShutdown(token: usize);

    fn GdipCreateBitmapFromScan0(
        width: i32,
        height: i32,
        stride: i32,
        format: i32,
        scan0: *mut u8,
        bitmap: *mut *mut c_void,
    ) -> i32;
    fn GdipDisposeImage(image: *mut c_void) -> i32;
    fn GdipGetImageGraphicsContext(image: *mut c_void, graphics: *mut *mut c_void) -> i32;
    fn GdipDeleteGraphics(graphics: *mut c_void) -> i32;
    fn GdipSetSmoothingMode(graphics: *mut c_void, smoothing_mode: i32) -> i32;
    fn GdipSetTextRenderingHint(graphics: *mut c_void, mode: i32) -> i32;
    fn GdipGraphicsClear(graphics: *mut c_void, color: u32) -> i32;

    fn GdipCreateFontFamilyFromName(
        name: *const u16,
        font_collection: *mut c_void,
        font_family: *mut *mut c_void,
    ) -> i32;
    fn GdipGetGenericFontFamilySansSerif(native_family: *mut *mut c_void) -> i32;
    fn GdipDeleteFontFamily(font_family: *mut c_void) -> i32;
    fn GdipCreateFont(
        font_family: *mut c_void,
        em_size: f32,
        style: i32,
        unit: i32,
        font: *mut *mut c_void,
    ) -> i32;
    fn GdipDeleteFont(font: *mut c_void) -> i32;

    fn GdipStringFormatGetGenericTypographic(format: *mut *mut c_void) -> i32;
    fn GdipCreateStringFormat(format_attributes: i32, language: u16, format: *mut *mut c_void)
        -> i32;
    fn GdipDeleteStringFormat(format: *mut c_void) -> i32;
    fn GdipSetStringFormatAlign(format: *mut c_void, align: i32) -> i32;
    fn GdipSetStringFormatLineAlign(format: *mut c_void, align: i32) -> i32;
    fn GdipSetStringFormatFlags(format: *mut c_void, flags: i32) -> i32;
    fn GdipMeasureString(
        graphics: *mut c_void,
        string: *const u16,
        length: i32,
        font: *mut c_void,
        layout_rect: *const RectF,
        string_format: *mut c_void,
        bounding_box: *mut RectF,
        codepoints_fitted: *mut i32,
        lines_filled: *mut i32,
    ) -> i32;

    fn GdipCreatePath(brush_mode: i32, path: *mut *mut c_void) -> i32;
    fn GdipDeletePath(path: *mut c_void) -> i32;
    fn GdipAddPathArc(
        path: *mut c_void,
        x: f32,
        y: f32,
        width: f32,
        height: f32,
        start_angle: f32,
        sweep_angle: f32,
    ) -> i32;
    fn GdipClosePathFigure(path: *mut c_void) -> i32;

    fn GdipCreateSolidFill(color: u32, brush: *mut *mut c_void) -> i32;
    fn GdipDeleteBrush(brush: *mut c_void) -> i32;
    fn GdipFillPath(graphics: *mut c_void, brush: *mut c_void, path: *mut c_void) -> i32;
    fn GdipDrawString(
        graphics: *mut c_void,
        string: *const u16,
        length: i32,
        font: *mut c_void,
        layout_rect: *const RectF,
        string_format: *mut c_void,
        brush: *mut c_void,
    ) -> i32;

    fn GdipCreateHICONFromBitmap(bitmap: *mut c_void, hicon: *mut *mut c_void) -> i32;
}

pub struct GdiplusGuard {
    token: usize,
}

impl GdiplusGuard {
    pub fn start() -> Result<Self, String> {
        let mut token: usize = 0;
        let input = GdiplusStartupInput {
            gdiplus_version: 1,
            debug_event_callback: ptr::null(),
            suppress_background_thread: 0,
            suppress_external_codecs: 0,
        };
        let status = unsafe { GdiplusStartup(&mut token, &input, ptr::null_mut()) };
        if status != 0 {
            return Err(format!("GdiplusStartup failed: {status}"));
        }
        Ok(Self { token })
    }
}

impl Drop for GdiplusGuard {
    fn drop(&mut self) {
        if self.token != 0 {
            unsafe {
                GdiplusShutdown(self.token);
            }
        }
    }
}

struct BitmapGuard(*mut c_void);
impl Drop for BitmapGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDisposeImage(self.0);
            }
        }
    }
}

struct GraphicsGuard(*mut c_void);
impl Drop for GraphicsGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDeleteGraphics(self.0);
            }
        }
    }
}

struct FontFamilyGuard(*mut c_void);
impl Drop for FontFamilyGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDeleteFontFamily(self.0);
            }
        }
    }
}

struct FontGuard(*mut c_void);
impl Drop for FontGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDeleteFont(self.0);
            }
        }
    }
}

struct PathGuard(*mut c_void);
impl Drop for PathGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDeletePath(self.0);
            }
        }
    }
}

struct BrushGuard(*mut c_void);
impl Drop for BrushGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDeleteBrush(self.0);
            }
        }
    }
}

struct StringFormatGuard(*mut c_void);
impl Drop for StringFormatGuard {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                GdipDeleteStringFormat(self.0);
            }
        }
    }
}

fn check_gdip(status: i32, op: &str) -> Result<(), String> {
    if status == 0 {
        Ok(())
    } else {
        Err(format!("{op} failed with GDI+ status {status}"))
    }
}

pub fn format_badge_text(value: i32) -> String {
    if value > 99 {
        "99+".to_string()
    } else {
        value.to_string()
    }
}

pub fn render_badge_icon(value: i32) -> Result<isize, String> {
    let text = format_badge_text(value);
    let text_w: Vec<u16> = text.encode_utf16().collect();
    let text_len = text_w.len() as i32;

    let size = 32i32;
    let size_f = size as f32;
    let height = 30.0f32;
    let font_size = match text.len() {
        1 => 27.0f32,
        2 => 21.0f32,
        _ => 15.0f32,
    };

    let mut bitmap: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe {
            GdipCreateBitmapFromScan0(size, size, 0, PIXEL_FORMAT_32BPP_ARGB, ptr::null_mut(), &mut bitmap)
        },
        "GdipCreateBitmapFromScan0",
    )?;
    let _bitmap = BitmapGuard(bitmap);

    let mut graphics: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipGetImageGraphicsContext(bitmap, &mut graphics) },
        "GdipGetImageGraphicsContext",
    )?;
    let _graphics = GraphicsGuard(graphics);

    unsafe {
        let _ = GdipSetSmoothingMode(graphics, SMOOTHING_MODE_ANTI_ALIAS);
        let _ = GdipSetTextRenderingHint(graphics, TEXT_RENDERING_HINT_ANTI_ALIAS_GRID_FIT);
        let _ = GdipGraphicsClear(graphics, 0x0000_0000);
    }

    let family_name = to_wide("Segoe UI");
    let mut family: *mut c_void = ptr::null_mut();
    let fam_status =
        unsafe { GdipCreateFontFamilyFromName(family_name.as_ptr(), ptr::null_mut(), &mut family) };
    if fam_status != 0 || family.is_null() {
        check_gdip(
            unsafe { GdipGetGenericFontFamilySansSerif(&mut family) },
            "GdipGetGenericFontFamilySansSerif",
        )?;
    }
    let _family = FontFamilyGuard(family);

    let mut font: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipCreateFont(family, font_size, FONT_STYLE_BOLD, UNIT_PIXEL, &mut font) },
        "GdipCreateFont",
    )?;
    let _font = FontGuard(font);

    // GenericTypographic is a process-wide shared GDI+ singleton and must NOT be deleted.
    let mut tight_format: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipStringFormatGetGenericTypographic(&mut tight_format) },
        "GdipStringFormatGetGenericTypographic",
    )?;

    let origin = RectF {
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
    };
    let mut bounds = RectF {
        x: 0.0,
        y: 0.0,
        width: 0.0,
        height: 0.0,
    };
    check_gdip(
        unsafe {
            GdipMeasureString(
                graphics,
                text_w.as_ptr(),
                text_len,
                font,
                &origin,
                tight_format,
                &mut bounds,
                ptr::null_mut(),
                ptr::null_mut(),
            )
        },
        "GdipMeasureString",
    )?;

    let width = size_f.min(height.max(bounds.width.ceil() + 6.0));
    let x = (size_f - width) / 2.0;
    let y = (size_f - height) / 2.0;

    let mut path: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipCreatePath(FILL_MODE_ALTERNATE, &mut path) },
        "GdipCreatePath",
    )?;
    let _path = PathGuard(path);

    check_gdip(
        unsafe { GdipAddPathArc(path, x, y, height, height, 90.0, 180.0) },
        "GdipAddPathArc(left)",
    )?;
    check_gdip(
        unsafe { GdipAddPathArc(path, x + width - height, y, height, height, 270.0, 180.0) },
        "GdipAddPathArc(right)",
    )?;
    check_gdip(unsafe { GdipClosePathFigure(path) }, "GdipClosePathFigure")?;

    let mut chip_brush: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipCreateSolidFill(CHIP_COLOR_ARGB, &mut chip_brush) },
        "GdipCreateSolidFill(chip)",
    )?;
    let _chip_brush = BrushGuard(chip_brush);
    check_gdip(
        unsafe { GdipFillPath(graphics, chip_brush, path) },
        "GdipFillPath",
    )?;

    let mut format: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipCreateStringFormat(0, 0, &mut format) },
        "GdipCreateStringFormat",
    )?;
    let _format = StringFormatGuard(format);
    unsafe {
        let _ = GdipSetStringFormatAlign(format, STRING_ALIGNMENT_CENTER);
        let _ = GdipSetStringFormatLineAlign(format, STRING_ALIGNMENT_CENTER);
        let _ = GdipSetStringFormatFlags(format, STRING_FORMAT_FLAGS_NO_WRAP);
    }

    let mut white_brush: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipCreateSolidFill(WHITE_ARGB, &mut white_brush) },
        "GdipCreateSolidFill(white)",
    )?;
    let _white_brush = BrushGuard(white_brush);

    let layout = RectF {
        x: -4.0,
        y: 0.0,
        width: size_f + 8.0,
        height: size_f,
    };
    check_gdip(
        unsafe {
            GdipDrawString(
                graphics,
                text_w.as_ptr(),
                text_len,
                font,
                &layout,
                format,
                white_brush,
            )
        },
        "GdipDrawString",
    )?;

    let mut hicon: *mut c_void = ptr::null_mut();
    check_gdip(
        unsafe { GdipCreateHICONFromBitmap(bitmap, &mut hicon) },
        "GdipCreateHICONFromBitmap",
    )?;
    if hicon.is_null() {
        return Err("GdipCreateHICONFromBitmap returned null HICON".to_string());
    }
    Ok(hicon as isize)
}
