from manim import *

class ForkJoinExecution(Scene):
    """Visualize how a single thread forks into parallel workers and joins back."""
    def construct(self):
        self.camera.background_color = "#1a1a2e"

        title = Text("Fork-Join Parallelism", font_size=36, color=WHITE).to_edge(UP, buff=0.4)
        self.play(Write(title))

        main_start = Dot(LEFT * 5, color=BLUE, radius=0.12)
        main_label = Text("main()", font_size=20, color=BLUE_B).next_to(main_start, UP, buff=0.15)
        self.play(FadeIn(main_start), Write(main_label))

        fork_point = LEFT * 2
        fork_dot = Dot(fork_point, color=YELLOW, radius=0.15)
        fork_label = Text("fork()", font_size=20, color=YELLOW).next_to(fork_dot, UP, buff=0.3)
        main_to_fork = Arrow(main_start.get_center(), fork_point, color=BLUE, buff=0.12, stroke_width=3)
        self.play(GrowArrow(main_to_fork))
        self.play(FadeIn(fork_dot), Write(fork_label))

        thread_colors = [RED_C, GREEN_C, TEAL_C, ORANGE]
        thread_labels = ["T0", "T1", "T2", "T3"]
        thread_y = [1.5, 0.5, -0.5, -1.5]
        thread_end_x = 2.0

        fork_arrows = []
        task_rects = []
        task_texts = []
        for i in range(4):
            start = fork_point
            end_pt = np.array([0, thread_y[i], 0])
            arr = Arrow(start, end_pt, color=thread_colors[i], buff=0.05, stroke_width=2.5)
            fork_arrows.append(arr)

            rect = RoundedRectangle(
                width=1.8, height=0.5, corner_radius=0.1,
                color=thread_colors[i], fill_color=thread_colors[i], fill_opacity=0.2
            ).move_to(np.array([1.0, thread_y[i], 0]))
            task_rects.append(rect)

            txt = Text(f"{thread_labels[i]}: task {i}", font_size=16, color=thread_colors[i])
            txt.move_to(rect.get_center())
            task_texts.append(txt)

        self.play(*[GrowArrow(a) for a in fork_arrows], run_time=0.8)
        self.play(
            *[FadeIn(r) for r in task_rects],
            *[Write(t) for t in task_texts],
            run_time=0.7
        )

        progress_bars = []
        for i in range(4):
            bar_bg = Rectangle(width=1.6, height=0.08, color=GREY_D, fill_color=GREY_D, fill_opacity=0.5)
            bar_bg.move_to(np.array([1.0, thread_y[i] - 0.2, 0]))
            bar_fill = Rectangle(width=0.01, height=0.08, color=thread_colors[i], fill_color=thread_colors[i], fill_opacity=0.9)
            bar_fill.align_to(bar_bg, LEFT)
            progress_bars.append((bar_bg, bar_fill))

        self.play(*[FadeIn(bg) for bg, _ in progress_bars], run_time=0.3)

        durations = [1.0, 0.7, 1.3, 0.9]
        anims = []
        for i, (bg, fill) in enumerate(progress_bars):
            target = fill.copy().set_width(1.6).align_to(bg, LEFT)
            anims.append(Transform(fill, target, run_time=durations[i]))
        self.play(*anims)

        join_point = RIGHT * 3.5
        join_dot = Dot(join_point, color=YELLOW, radius=0.15)
        join_label = Text("join()", font_size=20, color=YELLOW).next_to(join_dot, UP, buff=0.3)

        join_arrows = []
        for i in range(4):
            arr = Arrow(
                np.array([thread_end_x, thread_y[i], 0]), join_point,
                color=thread_colors[i], buff=0.05, stroke_width=2.5
            )
            join_arrows.append(arr)

        self.play(*[GrowArrow(a) for a in join_arrows], run_time=0.8)
        self.play(FadeIn(join_dot), Write(join_label))

        result_dot = Dot(RIGHT * 5.5, color=BLUE, radius=0.12)
        result_label = Text("result", font_size=20, color=BLUE_B).next_to(result_dot, UP, buff=0.15)
        join_to_result = Arrow(join_point, result_dot.get_center(), color=BLUE, buff=0.12, stroke_width=3)
        self.play(GrowArrow(join_to_result))
        self.play(FadeIn(result_dot), Write(result_label))

        speedup = Text("4 tasks in parallel ≈ 4× speedup", font_size=22, color=GREEN_B)
        speedup.to_edge(DOWN, buff=0.5)
        self.play(Write(speedup))
        self.wait(1.5)
