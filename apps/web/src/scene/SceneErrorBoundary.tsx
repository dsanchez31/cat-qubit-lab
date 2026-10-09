import { Component, type ReactNode } from "react";

interface SceneErrorBoundaryProps {
  children: ReactNode;
  onError: () => void;
}

interface SceneErrorBoundaryState {
  failed: boolean;
}

/** Catches a failed WebGL context creation and replaces the canvas with an explanation. */
export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  override state: SceneErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error("3D view unavailable", error);
    this.props.onError();
  }

  override render() {
    if (this.state.failed) {
      return (
        <div className="grid h-full place-items-center p-8 text-center text-sm text-slate-50">
          WebGL is unavailable in this browser, the 3D view cannot be displayed.
        </div>
      );
    }
    return this.props.children;
  }
}
