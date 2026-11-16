use std::collections::HashMap;
use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use std::time::{Duration, Instant};

use crate::popup::reply_keys;
use crate::popup::toast::show_failure_toast;
use crate::protocol::{is_known_app_id, parse_activation_route, ActivateInput, RouteKind, ToastEvent};
use crate::win32::{
    from_wide_ptr, open_protocol_url, CoRegisterClassObject, CoRevokeClassObject, RawGuid,
};

const CLSID_ACTIVATOR: RawGuid = RawGuid {
    data1: 0xBD86_FD58,
    data2: 0xA2BF,
    data3: 0x430E,
    data4: [0xA8, 0xD9, 0x8D, 0x20, 0x23, 0x8E, 0xD6, 0x1A],
};

const IID_IUNKNOWN: RawGuid = RawGuid {
    data1: 0x0000_0000,
    data2: 0x0000,
    data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

const IID_ICLASS_FACTORY: RawGuid = RawGuid {
    data1: 0x0000_0001,
    data2: 0x0000,
    data3: 0x0000,
    data4: [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46],
};

const IID_INOTIFICATION_ACTIVATION_CALLBACK: RawGuid = RawGuid {
    data1: 0x53E3_1837,
    data2: 0x6600,
    data3: 0x4A81,
    data4: [0x93, 0x95, 0x75, 0xCF, 0xFE, 0x74, 0x6F, 0x94],
};

const S_OK: i32 = 0;
const E_POINTER: i32 = 0x8000_4003u32 as i32;
const E_NOINTERFACE: i32 = 0x8000_4002u32 as i32;
const CLASS_E_NOAGGREGATION: i32 = 0x8004_0110u32 as i32;
const CLSCTX_LOCAL_SERVER: u32 = 4;
const REGCLS_MULTIPLEUSE: u32 = 1;

fn guid_eq(a: &RawGuid, b: &RawGuid) -> bool {
    a.data1 == b.data1 && a.data2 == b.data2 && a.data3 == b.data3 && a.data4 == b.data4
}

pub type EventSender = Arc<dyn Fn(&ToastEvent) -> bool + Send + Sync>;

struct AckWaiter {
    result: Mutex<Option<bool>>,
    cv: Condvar,
}

struct ActivatorState {
    emit: EventSender,
    assets_dir: Option<String>,
    pending: Mutex<HashMap<u64, Arc<AckWaiter>>>,
    next_id: AtomicU64,
    shutting_down: AtomicBool,
    registration: AtomicU32,
    registered: AtomicBool,
}

static STATE: OnceLock<Mutex<Option<Arc<ActivatorState>>>> = OnceLock::new();

fn state_slot() -> &'static Mutex<Option<Arc<ActivatorState>>> {
    STATE.get_or_init(|| Mutex::new(None))
}

fn current_state() -> Option<Arc<ActivatorState>> {
    state_slot().lock().ok().and_then(|g| g.clone())
}

#[repr(C)]
struct NotificationUserInputData {
    key: *const u16,
    value: *const u16,
}

#[repr(C)]
struct IClassFactoryVtbl {
    query_interface:
        unsafe extern "system" fn(*mut c_void, *const RawGuid, *mut *mut c_void) -> i32,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    create_instance: unsafe extern "system" fn(
        *mut c_void,
        *mut c_void,
        *const RawGuid,
        *mut *mut c_void,
    ) -> i32,
    lock_server: unsafe extern "system" fn(*mut c_void, i32) -> i32,
}

#[repr(C)]
struct ComClassFactory {
    vtbl: *const IClassFactoryVtbl,
    ref_count: AtomicU32,
}

static CLASS_FACTORY_VTBL: IClassFactoryVtbl = IClassFactoryVtbl {
    query_interface: factory_query_interface,
    add_ref: factory_add_ref,
    release: factory_release,
    create_instance: factory_create_instance,
    lock_server: factory_lock_server,
};

unsafe extern "system" fn factory_query_interface(
    this: *mut c_void,
    riid: *const RawGuid,
    ppv: *mut *mut c_void,
) -> i32 {
    if ppv.is_null() {
        return E_POINTER;
    }
    *ppv = ptr::null_mut();
    if riid.is_null() {
        return E_NOINTERFACE;
    }
    let iid = &*riid;
    if guid_eq(iid, &IID_IUNKNOWN) || guid_eq(iid, &IID_ICLASS_FACTORY) {
        *ppv = this;
        factory_add_ref(this);
        return S_OK;
    }
    E_NOINTERFACE
}

unsafe extern "system" fn factory_add_ref(this: *mut c_void) -> u32 {
    let obj = &*(this as *const ComClassFactory);
    obj.ref_count.fetch_add(1, Ordering::Relaxed) + 1
}

unsafe extern "system" fn factory_release(this: *mut c_void) -> u32 {
    let obj = &*(this as *const ComClassFactory);
    let prev = obj.ref_count.fetch_sub(1, Ordering::Release);
    if prev == 1 {
        std::sync::atomic::fence(Ordering::Acquire);
        drop(Box::from_raw(this as *mut ComClassFactory));
    }
    prev - 1
}

unsafe extern "system" fn factory_create_instance(
    _this: *mut c_void,
    outer: *mut c_void,
    riid: *const RawGuid,
    ppv: *mut *mut c_void,
) -> i32 {
    if ppv.is_null() {
        return E_POINTER;
    }
    *ppv = ptr::null_mut();
    if !outer.is_null() {
        return CLASS_E_NOAGGREGATION;
    }
    let activator = Box::into_raw(Box::new(ComToastActivator {
        vtbl: &ACTIVATOR_VTBL,
        ref_count: AtomicU32::new(1),
    })) as *mut c_void;
    let hr = activator_query_interface(activator, riid, ppv);
    activator_release(activator);
    hr
}

unsafe extern "system" fn factory_lock_server(_this: *mut c_void, _locked: i32) -> i32 {
    S_OK
}

#[repr(C)]
struct INotificationActivationCallbackVtbl {
    query_interface:
        unsafe extern "system" fn(*mut c_void, *const RawGuid, *mut *mut c_void) -> i32,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
    activate: unsafe extern "system" fn(
        *mut c_void,
        *const u16,
        *const u16,
        *const NotificationUserInputData,
        u32,
    ) -> i32,
}

#[repr(C)]
struct ComToastActivator {
    vtbl: *const INotificationActivationCallbackVtbl,
    ref_count: AtomicU32,
}

static ACTIVATOR_VTBL: INotificationActivationCallbackVtbl = INotificationActivationCallbackVtbl {
    query_interface: activator_query_interface,
    add_ref: activator_add_ref,
    release: activator_release,
    activate: activator_activate,
};

unsafe extern "system" fn activator_query_interface(
    this: *mut c_void,
    riid: *const RawGuid,
    ppv: *mut *mut c_void,
) -> i32 {
    if ppv.is_null() {
        return E_POINTER;
    }
    *ppv = ptr::null_mut();
    if riid.is_null() {
        return E_NOINTERFACE;
    }
    let iid = &*riid;
    if guid_eq(iid, &IID_IUNKNOWN) || guid_eq(iid, &IID_INOTIFICATION_ACTIVATION_CALLBACK) {
        *ppv = this;
        activator_add_ref(this);
        return S_OK;
    }
    E_NOINTERFACE
}

unsafe extern "system" fn activator_add_ref(this: *mut c_void) -> u32 {
    let obj = &*(this as *const ComToastActivator);
    obj.ref_count.fetch_add(1, Ordering::Relaxed) + 1
}

unsafe extern "system" fn activator_release(this: *mut c_void) -> u32 {
    let obj = &*(this as *const ComToastActivator);
    let prev = obj.ref_count.fetch_sub(1, Ordering::Release);
    if prev == 1 {
        std::sync::atomic::fence(Ordering::Acquire);
        drop(Box::from_raw(this as *mut ComToastActivator));
    }
    prev - 1
}

unsafe extern "system" fn activator_activate(
    _this: *mut c_void,
    app_user_model_id: *const u16,
    invoked_args: *const u16,
    data: *const NotificationUserInputData,
    count: u32,
) -> i32 {
    let _ = std::panic::catch_unwind(|| {
        let app_id = from_wide_ptr(app_user_model_id);
        let arguments = from_wide_ptr(invoked_args);
        let mut reply_text: Option<String> = None;
        if !data.is_null() && count > 0 {
            let items = std::slice::from_raw_parts(data, count as usize);
            for item in items {
                if from_wide_ptr(item.key) == "reply" {
                    reply_text = Some(from_wide_ptr(item.value));
                    break;
                }
            }
        }
        handle_activation(&app_id, &arguments, reply_text);
    });
    S_OK
}

fn deliver_and_wait_ack(
    state: &Arc<ActivatorState>,
    argument: &str,
    input: Option<ActivateInput>,
) -> bool {
    if state.shutting_down.load(Ordering::Acquire) {
        return false;
    }
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let waiter = Arc::new(AckWaiter {
        result: Mutex::new(None),
        cv: Condvar::new(),
    });
    if let Ok(mut map) = state.pending.lock() {
        map.insert(id, Arc::clone(&waiter));
    } else {
        return false;
    }

    let event = ToastEvent::Activate {
        id,
        argument: argument.to_string(),
        input,
    };
    if !(state.emit)(&event) {
        if let Ok(mut map) = state.pending.lock() {
            map.remove(&id);
        }
        return false;
    }

    let deadline = Instant::now() + Duration::from_secs(5);
    let acked = if let Ok(mut guard) = waiter.result.lock() {
        while guard.is_none() && !state.shutting_down.load(Ordering::Acquire) {
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            let (next_guard, timeout_res) = waiter
                .cv
                .wait_timeout(guard, deadline - now)
                .unwrap_or_else(|e| e.into_inner());
            guard = next_guard;
            if timeout_res.timed_out() {
                break;
            }
        }
        guard.unwrap_or(false)
    } else {
        false
    };

    if let Ok(mut map) = state.pending.lock() {
        map.remove(&id);
    }
    acked
}

fn handle_activation(app_id: &str, arguments: &str, reply_text: Option<String>) {
    if !is_known_app_id(app_id) {
        return;
    }
    let Some(kind) = parse_activation_route(arguments) else {
        return;
    };
    let Some(state) = current_state() else {
        return;
    };

    match kind {
        RouteKind::Open => {
            let _ = deliver_and_wait_ack(&state, arguments, None);
            open_protocol_url("dsh://open");
        }
        RouteKind::Decision => {
            let ok = deliver_and_wait_ack(&state, arguments, None);
            if !ok {
                show_failure_toast(true, state.assets_dir.as_deref());
            }
        }
        RouteKind::Reply => {
            let valid = reply_text
                .as_deref()
                .is_some_and(|t| !t.trim().is_empty() && t.encode_utf16().count() <= 8000);
            let ok = if valid {
                deliver_and_wait_ack(&state, arguments, Some(ActivateInput { reply: reply_text }))
            } else {
                false
            };
            if !ok {
                show_failure_toast(false, state.assets_dir.as_deref());
            }
        }
    }
}

pub fn resolve_ack(id: u64, ok: bool) {
    let Some(state) = current_state() else {
        return;
    };
    let waiter = state.pending.lock().ok().and_then(|mut map| map.remove(&id));
    if let Some(waiter) = waiter {
        if let Ok(mut guard) = waiter.result.lock() {
            *guard = Some(ok);
            waiter.cv.notify_all();
        }
    }
}

pub fn serve(assets_dir: Option<String>, emit: EventSender) -> Result<(), String> {
    let st = Arc::new(ActivatorState {
        emit,
        assets_dir,
        pending: Mutex::new(HashMap::new()),
        next_id: AtomicU64::new(1),
        shutting_down: AtomicBool::new(false),
        registration: AtomicU32::new(0),
        registered: AtomicBool::new(false),
    });

    if let Ok(mut slot) = state_slot().lock() {
        *slot = Some(Arc::clone(&st));
    }

    let factory = Box::into_raw(Box::new(ComClassFactory {
        vtbl: &CLASS_FACTORY_VTBL,
        ref_count: AtomicU32::new(1),
    })) as *mut c_void;

    let mut cookie: u32 = 0;
    let hr = unsafe {
        CoRegisterClassObject(
            &CLSID_ACTIVATOR,
            factory as *const c_void,
            CLSCTX_LOCAL_SERVER,
            REGCLS_MULTIPLEUSE,
            &mut cookie,
        )
    };
    unsafe {
        factory_release(factory);
    }
    if hr < 0 {
        if let Ok(mut slot) = state_slot().lock() {
            *slot = None;
        }
        return Err(format!("CoRegisterClassObject failed: 0x{:08X}", hr as u32));
    }
    st.registration.store(cookie, Ordering::Release);
    st.registered.store(true, Ordering::Release);
    reply_keys::start();
    Ok(())
}

pub fn shutdown() {
    reply_keys::stop();
    let prev = state_slot().lock().ok().and_then(|mut slot| slot.take());
    if let Some(st) = prev {
        st.shutting_down.store(true, Ordering::Release);
        if let Ok(mut map) = st.pending.lock() {
            for (_, waiter) in map.drain() {
                if let Ok(mut guard) = waiter.result.lock() {
                    *guard = Some(false);
                    waiter.cv.notify_all();
                }
            }
        }
        if st.registered.swap(false, Ordering::AcqRel) {
            let cookie = st.registration.load(Ordering::Acquire);
            unsafe {
                let _ = CoRevokeClassObject(cookie);
            }
        }
    }
}
