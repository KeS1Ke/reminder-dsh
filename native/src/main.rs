mod popup;
mod protocol;
mod taskbar;
#[cfg(windows)]
mod win32;

fn print_help() {
    println!(
        "dsh-reminder-helper {}\n\nUsage:\n  dsh-reminder-helper toast-host [--assets-dir <dir>]\n  dsh-reminder-helper taskbar-badge\n  dsh-reminder-helper --validate-toast [--assets-dir <dir>]\n  dsh-reminder-helper --drain-self-test\n  dsh-reminder-helper --validate-taskbar\n  dsh-reminder-helper --help | -h\n  dsh-reminder-helper --version | -V",
        env!("CARGO_PKG_VERSION")
    );
}

fn parse_assets_dir(args: &[String]) -> Result<Option<String>, String> {
    let mut assets_dir = None;
    let mut idx = 0usize;
    while idx < args.len() {
        match args[idx].as_str() {
            "--assets-dir" => {
                let value = args
                    .get(idx + 1)
                    .ok_or_else(|| "Missing value for --assets-dir".to_string())?;
                assets_dir = Some(value.clone());
                idx += 2;
            }
            other => return Err(format!("Unknown argument: {other}")),
        }
    }
    Ok(assets_dir)
}

fn run() -> Result<(), String> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let Some(cmd) = args.first().map(String::as_str) else {
        print_help();
        return Err("Missing command.".to_string());
    };

    match cmd {
        "--help" | "-h" => {
            print_help();
            Ok(())
        }
        "--version" | "-V" => {
            println!("dsh-reminder-helper {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        "toast-host" => {
            let assets_dir = parse_assets_dir(&args[1..])?;
            popup::run_toast_host(assets_dir)
        }
        "--validate-toast" => {
            let assets_dir = parse_assets_dir(&args[1..])?;
            popup::run_validate_toast(assets_dir)
        }
        "taskbar-badge" => {
            if args.len() > 1 {
                return Err(format!("Unknown argument: {}", args[1]));
            }
            taskbar::run_taskbar_badge()
        }
        "--drain-self-test" => {
            if args.len() > 1 {
                return Err(format!("Unknown argument: {}", args[1]));
            }
            taskbar::run_drain_self_test()
        }
        "--validate-taskbar" => {
            if args.len() > 1 {
                return Err(format!("Unknown argument: {}", args[1]));
            }
            taskbar::run_validate_taskbar()
        }
        other => Err(format!("Unknown command: {other}")),
    }
}

fn main() {
    if let Err(err) = run() {
        eprintln!("{err}");
        std::process::exit(1);
    }
}
