#!/usr/bin/env python3
"""Pomodoro Timer — a desktop tomato timer built with tkinter."""

import tkinter as tk
from tkinter import font as tkfont
import subprocess

# ── Configuration ────────────────────────────────────────────────────
WORK_MIN = 25
SHORT_BREAK_MIN = 5
LONG_BREAK_MIN = 15
POMODOROS_BEFORE_LONG_BREAK = 4

COLORS = {
    "focus":       {"bg": "#1e1e2e", "fg": "#e74c3c", "ring_bg": "#2a1e2e", "status": "专注中"},
    "short_break": {"bg": "#1e1e2e", "fg": "#2ecc71", "ring_bg": "#1e2e24", "status": "短休息"},
    "long_break":  {"bg": "#1e1e2e", "fg": "#3498db", "ring_bg": "#1e2433", "status": "长休息"},
}


class PomodoroApp:
    """Main application window."""

    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Pomodoro")
        self.root.geometry("380x340")
        self.root.resizable(False, False)
        self.root.configure(bg="#1e1e2e")
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.center_window()

        # ── state ────────────────────────────────────────────────────
        self.state = "idle"                       # idle | running | paused
        self.timer_type = "focus"
        self.pomodoro_count = 0                   # total completed focus sessions
        self.cycle_count = 0                      # focus sessions in current cycle (0-4)
        self.time_remaining = WORK_MIN * 60
        self.total_time = WORK_MIN * 60
        self.timer_id = None
        self.colors = COLORS["focus"]

        # ── build UI ─────────────────────────────────────────────────
        self.build_ui()
        self.update_display()

        # ── keyboard shortcuts ───────────────────────────────────────
        self.root.bind("<space>", lambda _: self.toggle())
        self.root.bind("<Escape>", lambda _: self.reset())

        self.root.mainloop()

    # ── window helpers ───────────────────────────────────────────────

    def center_window(self):
        self.root.update_idletasks()
        w, h = 380, 340
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"{w}x{h}+{(sw - w) // 2}+{(sh - h) // 2}")

    # ── UI construction ──────────────────────────────────────────────

    def build_ui(self):
        # title
        self.title_lbl = tk.Label(
            self.root, text="Pomodoro",
            font=tkfont.Font(family="Helvetica Neue", size=14),
            bg="#1e1e2e", fg="#888",
        )
        self.title_lbl.pack(pady=(16, 0))

        # canvas – circular progress + timer text
        self.CV = 220
        self.canvas = tk.Canvas(
            self.root, width=self.CV, height=self.CV,
            bg="#1e1e2e", highlightthickness=0,
        )
        self.canvas.pack(pady=(6, 0))

        self.font_timer = tkfont.Font(family="Helvetica Neue", size=44, weight="light")
        self.font_status = tkfont.Font(family="Helvetica Neue", size=13)

        # pomodoro dots
        self.dots_frame = tk.Frame(self.root, bg="#1e1e2e")
        self.dots_frame.pack(pady=(2, 0))
        font_dot = tkfont.Font(family="Helvetica Neue", size=14)
        self.dots = []
        for _ in range(POMODOROS_BEFORE_LONG_BREAK):
            lbl = tk.Label(
                self.dots_frame, text="●",
                font=font_dot, bg="#1e1e2e", fg="#333",
            )
            lbl.pack(side=tk.LEFT, padx=4)
            self.dots.append(lbl)

        # buttons
        btn_frame = tk.Frame(self.root, bg="#1e1e2e")
        btn_frame.pack(pady=(8, 0))

        self.start_btn = tk.Button(
            btn_frame, text="▶  开始",
            font=tkfont.Font(family="Helvetica Neue", size=11),
            bg="#444", fg="white", activebackground="#666",
            activeforeground="white", bd=0, padx=22, pady=5,
            cursor="hand2", command=self.toggle,
        )
        self.start_btn.pack(side=tk.LEFT, padx=5)

        self.reset_btn = tk.Button(
            btn_frame, text="↺  重置",
            font=tkfont.Font(family="Helvetica Neue", size=11),
            bg="#444", fg="white", activebackground="#666",
            activeforeground="white", bd=0, padx=22, pady=5,
            cursor="hand2", command=self.reset,
        )
        self.reset_btn.pack(side=tk.LEFT, padx=5)

        # keyboard hint
        self.hint_lbl = tk.Label(
            self.root,
            text="Space 开始/暂停  ·  Esc 重置",
            font=tkfont.Font(family="Helvetica Neue", size=9),
            bg="#1e1e2e", fg="#555",
        )
        self.hint_lbl.pack(pady=(6, 0))

    # ── timer control ────────────────────────────────────────────────

    def toggle(self):
        if self.state == "running":
            self.pause()
        else:
            self.start()

    def start(self):
        if self.state == "running":
            return
        self.state = "running"
        self.start_btn.config(text="⏸  暂停")
        self.tick()

    def pause(self):
        self.state = "paused"
        self.start_btn.config(text="▶  继续")
        if self.timer_id:
            self.root.after_cancel(self.timer_id)
            self.timer_id = None

    def reset(self):
        self.state = "idle"
        self.start_btn.config(text="▶  开始")
        if self.timer_id:
            self.root.after_cancel(self.timer_id)
            self.timer_id = None
        durations = {"focus": WORK_MIN, "short_break": SHORT_BREAK_MIN, "long_break": LONG_BREAK_MIN}
        self.time_remaining = durations[self.timer_type] * 60
        self.total_time = self.time_remaining
        self.update_display()

    def tick(self):
        if self.state != "running":
            return
        self.time_remaining -= 1
        self.update_display()
        if self.time_remaining <= 0:
            self.on_complete()
        else:
            self.timer_id = self.root.after(1000, self.tick)

    def on_complete(self):
        self.state = "idle"
        self.start_btn.config(text="▶  开始")
        self.notify()
        self.play_sound()

        if self.timer_type == "focus":
            self.pomodoro_count += 1
            self.cycle_count += 1
            next_type = "long_break" if self.cycle_count >= POMODOROS_BEFORE_LONG_BREAK else "short_break"
            self.switch_to(next_type)
        elif self.timer_type == "short_break":
            self.switch_to("focus")
        else:  # long_break
            self.cycle_count = 0
            self.switch_to("focus")

    # ── theme / timer-type switching ────────────────────────────────

    def switch_to(self, new_type):
        self.timer_type = new_type
        self.colors = COLORS[new_type]
        durations = {"focus": WORK_MIN, "short_break": SHORT_BREAK_MIN, "long_break": LONG_BREAK_MIN}
        self.time_remaining = durations[new_type] * 60
        self.total_time = self.time_remaining
        self.apply_theme()
        self.update_display()

    def apply_theme(self):
        bg = self.colors["bg"]
        self.root.configure(bg=bg)
        self.canvas.configure(bg=bg)
        self.title_lbl.configure(bg=bg)
        self.dots_frame.configure(bg=bg)
        self.hint_lbl.configure(bg=bg)
        for d in self.dots:
            d.configure(bg=bg)

    # ── display ──────────────────────────────────────────────────────

    def update_display(self):
        self.canvas.delete("all")
        cx = cy = self.CV // 2
        R = 84               # ring radius
        W = 7                # ring width

        # progress ratio 0..1
        progress = 1 - (self.time_remaining / self.total_time) if self.total_time else 0

        # background ring
        self.canvas.create_oval(
            cx - R, cy - R, cx + R, cy + R,
            outline=self.colors["ring_bg"], width=W, fill="",
        )

        # progress arc
        if progress > 0:
            self.canvas.create_arc(
                cx - R, cy - R, cx + R, cy + R,
                start=90, extent=-360 * progress,
                outline=self.colors["fg"], width=W, style="arc",
            )

        # timer text
        m, s = divmod(self.time_remaining, 60)
        self.canvas.create_text(
            cx, cy - 10, text=f"{m:02d}:{s:02d}",
            font=self.font_timer, fill="white",
        )

        # status text
        self.canvas.create_text(
            cx, cy + 34, text=self.colors["status"],
            font=self.font_status, fill=self.colors["fg"],
        )

        # pomodoro dots
        for i, d in enumerate(self.dots):
            d.configure(fg=self.colors["fg"] if i < self.cycle_count else "#333")

    # ── notifications & sound ────────────────────────────────────────

    def notify(self):
        labels = {
            "focus":       ("专注时间到！", "该休息一下了"),
            "short_break": ("短休息结束",   "继续专注吧"),
            "long_break":  ("长休息结束",   "休息好了继续加油"),
        }
        title, msg = labels.get(self.timer_type, ("⏰", "时间到！"))
        try:
            subprocess.run(
                ["osascript", "-e",
                 f'display notification "{msg}" with title "{title}" sound name "default"'],
                timeout=2,
            )
        except Exception:
            pass

    def play_sound(self):
        try:
            subprocess.run(["afplay", "/System/Library/Sounds/Glass.aiff"], timeout=2)
        except Exception:
            self.root.bell()

    def on_close(self):
        if self.timer_id:
            self.root.after_cancel(self.timer_id)
        self.root.destroy()


if __name__ == "__main__":
    PomodoroApp()
