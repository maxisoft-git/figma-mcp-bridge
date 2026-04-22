import type { ServerRequest, PluginResponse, RequestType } from "./types";

import { handle as get_document } from "./handlers/get_document";
import { handle as get_selection } from "./handlers/get_selection";
import { handle as get_node } from "./handlers/get_node";
import { handle as get_styles } from "./handlers/get_styles";
import { handle as get_metadata } from "./handlers/get_metadata";
import { handle as get_design_context } from "./handlers/get_design_context";
import { handle as get_variable_defs } from "./handlers/get_variable_defs";
import { handle as get_screenshot } from "./handlers/get_screenshot";
import { handle as set_node_visibility } from "./handlers/set_node_visibility";
import { handle as set_text_content } from "./handlers/set_text_content";
import { handle as set_text_properties } from "./handlers/set_text_properties";
import { handle as set_node_properties } from "./handlers/set_node_properties";
import { handle as create_frame } from "./handlers/create_frame";
import { handle as create_text } from "./handlers/create_text";
import { handle as create_shape } from "./handlers/create_shape";
import { handle as create_image } from "./handlers/create_image";
import { handle as duplicate_nodes } from "./handlers/duplicate_nodes";
import { handle as reparent_nodes } from "./handlers/reparent_nodes";
import { handle as delete_nodes } from "./handlers/delete_nodes";
import { handle as move_nodes } from "./handlers/move_nodes";
import { handle as set_z_order } from "./handlers/set_z_order";
import { handle as align_nodes } from "./handlers/align_nodes";
import { handle as set_blend_mode } from "./handlers/set_blend_mode";
import { handle as set_clipping } from "./handlers/set_clipping";
import { handle as flatten } from "./handlers/flatten";
import { handle as set_auto_layout } from "./handlers/set_auto_layout";
import { handle as set_current_page } from "./handlers/set_current_page";
import { handle as find_nodes } from "./handlers/find_nodes";
import { handle as create_group } from "./handlers/create_group";
import { handle as apply_style } from "./handlers/apply_style";
import { handle as get_measurements } from "./handlers/get_measurements";
import { handle as get_color_palette } from "./handlers/get_color_palette";
import { handle as get_typography_scale } from "./handlers/get_typography_scale";
import { handle as get_spacing_system } from "./handlers/get_spacing_system";
import { handle as set_stroke } from "./handlers/set_stroke";
import { handle as set_effects } from "./handlers/set_effects";
import { handle as set_constraints } from "./handlers/set_constraints";
import { handle as set_gradient_fill } from "./handlers/set_gradient_fill";
import { handle as list_components } from "./handlers/list_components";
import { handle as create_component } from "./handlers/create_component";
import { handle as create_instance } from "./handlers/create_instance";
import { handle as set_instance_properties } from "./handlers/set_instance_properties";
import { handle as batch_mutation } from "./handlers/batch_mutation";
import { handle as get_image } from "./handlers/get_image";

type Handler = (request: ServerRequest) => Promise<PluginResponse>;

const handlers: Record<RequestType, Handler> = {
  get_document,
  get_selection,
  get_node,
  get_styles,
  get_metadata,
  get_design_context,
  get_variable_defs,
  get_screenshot,
  set_node_visibility,
  set_text_content,
  set_text_properties,
  set_node_properties,
  create_frame,
  create_text,
  create_shape,
  create_image,
  duplicate_nodes,
  reparent_nodes,
  delete_nodes,
  move_nodes,
  set_z_order,
  align_nodes,
  set_blend_mode,
  set_clipping,
  flatten,
  set_auto_layout,
  set_current_page,
  find_nodes,
  create_group,
  apply_style,
  get_measurements,
  get_color_palette,
  get_typography_scale,
  get_spacing_system,
  set_stroke,
  set_effects,
  set_constraints,
  set_gradient_fill,
  list_components,
  create_component,
  create_instance,
  set_instance_properties,
  batch_mutation,
  get_image,
};

export const dispatch = async (
  request: ServerRequest
): Promise<PluginResponse> => {
  const handler = handlers[request.type as RequestType];
  if (!handler) {
    throw new Error(`Unknown request type: ${request.type}`);
  }
  return handler(request);
};
