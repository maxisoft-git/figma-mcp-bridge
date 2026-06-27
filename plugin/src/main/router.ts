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
import { handle as create_paint_style } from "./handlers/create_paint_style";
import { handle as create_text_style } from "./handlers/create_text_style";
import { handle as create_effect_style } from "./handlers/create_effect_style";
import { handle as create_grid_style } from "./handlers/create_grid_style";
import { handle as create_variable_collection } from "./handlers/create_variable_collection";
import { handle as create_variable } from "./handlers/create_variable";
import { handle as get_dev_css } from "./handlers/get_dev_css";
import { handle as get_dev_svg } from "./handlers/get_dev_svg";
import { handle as get_dev_html } from "./handlers/get_dev_html";
import { handle as get_dev_json } from "./handlers/get_dev_json";
import { handle as get_dev_image } from "./handlers/get_dev_image";
import { handle as extract_design_system } from "./handlers/extract_design_system";
import { handle as extract_design_system_bulk } from "./handlers/extract_design_system_bulk";
import { handle as create_styles_table } from "./handlers/create_styles_table";
import { handle as apply_design_system } from "./handlers/apply_design_system";
import { handle as manage_manifests } from "./handlers/manage_manifests";
import { handle as bulk_rename } from "./handlers/bulk_rename";
import { handle as normalize_spacing } from "./handlers/normalize_spacing";
import { handle as switch_theme } from "./handlers/switch_theme";
import { handle as update_component_instances } from "./handlers/update_component_instances";
import { handle as normalize_layers } from "./handlers/normalize_layers";
import { handle as lint_styles } from "./handlers/lint_styles";
import { handle as generate_component_from_description } from "./handlers/generate_component_from_description";
import { handle as analyze_node_against_design } from "./handlers/analyze_node_against_design";
import { handle as apply_aria_labels } from "./handlers/apply_aria_labels";
import { handle as manage_snapshots } from "./handlers/manage_snapshots";
import { handle as diff_layouts } from "./handlers/diff_layouts";
import { handle as go_to_node } from "./handlers/go_to_node";
import { handle as get_selection_chain } from "./handlers/get_selection_chain";
import { handle as set_z_index_strategy } from "./handlers/set_z_index_strategy";
import { handle as inspect_node } from "./handlers/inspect_node";
import { handle as generate_code } from "./handlers/generate_code";
import { handle as inspect_variables } from "./handlers/inspect_variables";
import { handle as get_set_property_value } from "./handlers/get_set_property_value";
import { handle as get_layout_measurements } from "./handlers/get_layout_measurements";
import { handle as visualize_layout } from "./handlers/visualize_layout";
import { handle as get_constraints } from "./handlers/get_constraints";
import { handle as get_component_variants } from "./handlers/get_component_variants";
import { handle as apply_style_preset } from "./handlers/apply_style_preset";
import { handle as create_design_token_alias } from "./handlers/create_design_token_alias";
import { handle as bulk_swap_text } from "./handlers/bulk_swap_text";
import { handleSet as set_node_metadata, handleGet as get_node_metadata } from "./handlers/node_metadata";
import { handle as figma_inspect } from "./handlers/figma_inspect";

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
  create_paint_style,
  create_text_style,
  create_effect_style,
  create_grid_style,
  create_variable_collection,
  create_variable,
  get_dev_css,
  get_dev_svg,
  get_dev_html,
  get_dev_json,
  get_dev_image,
  extract_design_system,
  extract_design_system_bulk,
  create_styles_table,
  apply_design_system,
  manage_manifests,
  bulk_rename,
  normalize_spacing,
  switch_theme,
  update_component_instances,
  normalize_layers,
  lint_styles,
  generate_component_from_description,
  analyze_node_against_design,
  apply_aria_labels,
  manage_snapshots,
  diff_layouts,
  go_to_node,
  get_selection_chain,
  set_z_index_strategy,
  inspect_node,
  generate_code,
  inspect_variables,
  get_set_property_value,
  get_layout_measurements,
  visualize_layout,
  get_constraints,
  get_component_variants,
  apply_style_preset,
  create_design_token_alias,
  bulk_swap_text,
  set_node_metadata,
  get_node_metadata,
  figma_inspect,
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
