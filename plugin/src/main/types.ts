export type RequestType =
  | "get_document"
  | "get_selection"
  | "get_node"
  | "get_styles"
  | "get_metadata"
  | "get_design_context"
  | "get_variable_defs"
  | "get_screenshot"
  | "set_node_visibility"
  | "set_text_content"
  | "set_text_properties"
  | "set_node_properties"
  | "create_frame"
  | "create_text"
  | "create_shape"
  | "create_image"
  | "duplicate_nodes"
  | "reparent_nodes"
  | "delete_nodes"
  | "move_nodes"
  | "set_z_order"
  | "align_nodes"
  | "set_blend_mode"
  | "set_clipping"
  | "flatten"
  | "set_auto_layout"
  | "set_current_page"
  | "find_nodes"
  | "create_group"
  | "apply_style"
  | "get_measurements"
  | "get_color_palette"
  | "get_typography_scale"
  | "get_spacing_system"
  | "set_stroke"
  | "set_effects"
  | "set_constraints"
  | "set_gradient_fill"
  | "list_components"
  | "create_component"
  | "create_instance"
  | "set_instance_properties"
  | "batch_mutation";

export type ServerRequest = {
  type: RequestType;
  requestId: string;
  nodeIds?: string[];
  params?: Record<string, unknown>;
};

import type { PluginError } from "./errors";

export type PluginResponse = {
  type: string;
  requestId: string;
  data?: unknown;
  error?: PluginError;
};
