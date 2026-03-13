from manim import *
import numpy as np

class AmdahlsLaw(Scene):
    """Visualize Amdahl's Law — speedup vs processors for different parallel fractions."""
    def construct(self):
        self.camera.background_color = "#1a1a2e"

        title = Text("Amdahl's Law", font_size=36, color=WHITE).to_edge(UP, buff=0.4)
        formula = Text(
            "S(n) = 1 / [(1-p) + p/n]",
            font_size=22, color=GREY_B
        ).next_to(title, DOWN, buff=0.2)
        self.play(Write(title), Write(formula))

        ax = Axes(
            x_range=[1, 64, 8],
            y_range=[0, 20, 4],
            x_length=8,
            y_length=4.5,
            axis_config={"color": GREY_C, "include_numbers": False},
            tips=False,
        ).shift(DOWN * 0.6)

        x_nums = [1, 8, 16, 24, 32, 48, 64]
        for n in x_nums:
            lbl = Text(str(n), font_size=14, color=GREY_C).next_to(ax.c2p(n, 0), DOWN, buff=0.15)
            self.add(lbl)
        y_nums = [0, 4, 8, 12, 16, 20]
        for n in y_nums:
            lbl = Text(str(n), font_size=14, color=GREY_C).next_to(ax.c2p(1, n), LEFT, buff=0.15)
            self.add(lbl)

        x_label = Text("Number of Processors (n)", font_size=18, color=GREY_B).next_to(ax.x_axis, DOWN, buff=0.4)
        y_label = Text("Speedup S(n)", font_size=18, color=GREY_B).next_to(ax.y_axis, LEFT, buff=0.4).rotate(PI / 2)
        self.play(Create(ax), Write(x_label), Write(y_label))

        fractions = [0.5, 0.75, 0.9, 0.95, 0.99]
        colors = [RED_C, ORANGE, YELLOW, GREEN_C, TEAL_C]
        labels_text = ["50%", "75%", "90%", "95%", "99%"]

        legend = VGroup()
        for i, (p, c, lt) in enumerate(zip(fractions, colors, labels_text)):
            dot = Dot(color=c, radius=0.06)
            lbl = Text(f"p = {lt}", font_size=14, color=c)
            row = VGroup(dot, lbl).arrange(RIGHT, buff=0.1)
            legend.add(row)
        legend.arrange(DOWN, buff=0.15, aligned_edge=LEFT)
        legend.to_corner(UR, buff=0.5).shift(DOWN * 0.8)

        for i, (p, c) in enumerate(zip(fractions, colors)):
            def amdahl(x, p=p):
                return 1.0 / ((1 - p) + p / x)

            graph = ax.plot(
                amdahl,
                x_range=[1, 64, 0.5],
                color=c,
                stroke_width=2.5,
            )

            limit_val = 1.0 / (1 - p)
            if limit_val <= 20:
                limit_line = DashedLine(
                    ax.c2p(1, limit_val), ax.c2p(64, limit_val),
                    color=c, stroke_width=1, dash_length=0.08
                )
                limit_text = Text(f"max={limit_val:.0f}×", font_size=13, color=c)
                limit_text.next_to(limit_line, RIGHT, buff=0.1)
                self.play(Create(graph), Create(limit_line), FadeIn(limit_text),
                          FadeIn(legend[i]), run_time=0.9)
            else:
                self.play(Create(graph), FadeIn(legend[i]), run_time=0.9)

        insight = Text(
            "Even 5% serial code limits speedup to 20× max",
            font_size=20, color=YELLOW
        ).to_edge(DOWN, buff=0.35)
        box = SurroundingRectangle(insight, color=YELLOW, buff=0.12, corner_radius=0.1, stroke_width=1.5)
        self.play(Write(insight), Create(box))
        self.wait(2)
