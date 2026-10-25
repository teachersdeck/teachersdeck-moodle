/* =========================================================
   DrawDeck (v0.22.0) — a full-screen whiteboard for TeachersDeck, with a mind map and a flowchart mode.
   No library: everything is plain canvas + DOM, so there is nothing extra to bundle (Manifest V3 forbids remote code).

   One canvas holds three kinds of content that can be mixed freely:
     • ink      — pens, highlighter, eraser, text, lines, arrows and shapes
     • mind map — topic nodes with a parent; children are laid out automatically (Tab = child, Enter = sibling)
     • flowchart— shapes joined by connectors that follow the shapes when they move
   Every object is immutable: a change replaces it, so one undo/redo history (a stack of arrays) covers all three.

   Storage: boards are saved in IndexedDB ("boards" store of the TeachersDeck database), pages as plain JSON.
   Used by app.js:  Object.assign(STRINGS, DrawDeck.strings);  DrawDeck.mount(bodyEl, host) -> cleanup()
   host = { t, toast, close, idb, lang, download(blob, name), watermark }
   Optional capabilities, each off unless the host sets it (same pattern as share/assignBoard below):
     kidMode             simplifies the toolbar to pen/highlighter/eraser/shape/undo only (no mind map, no
                          flowchart, no math tools, no image/template/outline), for KeepDeck's Home board.
     kidModeUnlock()     only used when kidMode is on. Called before a multi-object delete, a whole-board or
                          whole-page delete, or an export/import — return a (possibly async) truthy value to
                          allow it. No host.kidModeUnlock = the action is simply refused (toast only).
   ========================================================= */
(function (root) {
  'use strict';

  /* ---------------- strings (languages not listed fall back to English) ---------------- */
  var S = {
    drawdeck:        { en: '🎨 DrawDeck', vi: '🎨 DrawDeck' },
    wc_drawdeck:     { en: 'Full-screen whiteboard with pens, shapes, mind maps and flowcharts.', vi: 'Bảng trắng toàn màn hình: bút, hình khối, sơ đồ tư duy và lưu đồ.' },
    dd_board:        { en: 'Boards', vi: 'Bảng vẽ' },
    dd_kid_locked:   { en: 'Ask a parent to unlock this', vi: 'Nhờ bố mẹ mở khóa' },
    dd_new_board:    { en: '＋ New board', vi: '＋ Bảng mới' },
    dd_rename:       { en: 'Rename board', vi: 'Đổi tên bảng' },
    dd_rename_ask:   { en: 'Board name:', vi: 'Tên bảng:' },
    dd_del_board:    { en: 'Delete this board', vi: 'Xóa bảng này' },
    dd_del_board_q:  { en: 'Delete this board and all its pages?', vi: 'Xóa bảng này cùng mọi trang của nó?' },
    dd_untitled:     { en: 'Board {n}', vi: 'Bảng {n}' },
    dd_page:         { en: 'Page {n} of {total}', vi: 'Trang {n} / {total}' },
    dd_prev_page:    { en: 'Previous page', vi: 'Trang trước' },
    dd_next_page:    { en: 'Next page', vi: 'Trang sau' },
    dd_add_page:     { en: 'Add a page', vi: 'Thêm trang' },
    dd_dup_page:     { en: 'Duplicate this page', vi: 'Nhân đôi trang này' },
    dd_del_page:     { en: 'Delete this page', vi: 'Xóa trang này' },
    dd_del_page_q:   { en: 'Delete this page?', vi: 'Xóa trang này?' },
    dd_clear_page:   { en: 'Clear this page', vi: 'Xóa sạch trang này' },
    dd_clear_q:      { en: 'Clear everything on this page? (Undo brings it back.)', vi: 'Xóa mọi thứ trên trang này? (Hoàn tác sẽ khôi phục.)' },
    dd_mode_draw:    { en: 'Draw', vi: 'Vẽ' },
    dd_mode_mind:    { en: 'Mind map', vi: 'Sơ đồ tư duy' },
    dd_mode_flow:    { en: 'Flowchart', vi: 'Lưu đồ' },
    dd_t_select:     { en: 'Select and move (V)', vi: 'Chọn và di chuyển (V)' },
    dd_t_hand:       { en: 'Pan (hold Space)', vi: 'Kéo màn hình (giữ Space)' },
    dd_t_pen:        { en: 'Pen (P)', vi: 'Bút (P)' },
    dd_t_hl:         { en: 'Highlighter (H)', vi: 'Bút dạ quang (H)' },
    dd_t_eraser:     { en: 'Eraser (E)', vi: 'Tẩy (E)' },
    dd_t_text:       { en: 'Text (T)', vi: 'Văn bản (T)' },
    dd_t_shape:      { en: 'Shapes (S)', vi: 'Hình khối (S)' },
    dd_t_conn:       { en: 'Connector (C) — drag from one shape to another', vi: 'Đường nối (C) — kéo từ hình này sang hình kia' },
    dd_undo:         { en: 'Undo (Ctrl+Z)', vi: 'Hoàn tác (Ctrl+Z)' },
    dd_redo:         { en: 'Redo (Ctrl+Y)', vi: 'Làm lại (Ctrl+Y)' },
    dd_zoom_in:      { en: 'Zoom in', vi: 'Phóng to' },
    dd_zoom_out:     { en: 'Zoom out', vi: 'Thu nhỏ' },
    dd_zoom_fit:     { en: 'Fit everything (1)', vi: 'Vừa khung (1)' },
    dd_zoom_reset:   { en: 'Back to 100% (0)', vi: 'Về 100% (0)' },
    dd_color:        { en: 'Colour', vi: 'Màu' },
    dd_custom:       { en: 'Pick any colour', vi: 'Chọn màu tùy ý' },
    dd_size:         { en: 'Size', vi: 'Cỡ nét' },
    dd_fill:         { en: 'Fill shapes', vi: 'Tô màu hình' },
    dd_bg:           { en: 'Background', vi: 'Nền' },
    dd_bg_white:     { en: 'Whiteboard', vi: 'Bảng trắng' },
    dd_bg_chalk:     { en: 'Blackboard', vi: 'Bảng đen' },
    dd_bg_grid:      { en: 'Grid', vi: 'Ô lưới' },
    dd_bg_lined:     { en: 'Lined paper', vi: 'Giấy kẻ dòng' },
    dd_bg_graph:     { en: 'Graph paper', vi: 'Giấy kẻ ô ly' },
    dd_bg_axes:      { en: 'Coordinate axes', vi: 'Trục tọa độ' },
    dd_bg_dots:      { en: 'Dots', vi: 'Chấm' },
    dd_s_rect:       { en: 'Rectangle', vi: 'Chữ nhật' },
    dd_s_ellipse:    { en: 'Ellipse', vi: 'Elip' },
    dd_s_diamond:    { en: 'Decision (diamond)', vi: 'Quyết định (hình thoi)' },
    dd_s_round:      { en: 'Process', vi: 'Bước xử lý' },
    dd_s_pill:       { en: 'Start / end', vi: 'Bắt đầu / kết thúc' },
    dd_s_note:       { en: 'Sticky note', vi: 'Giấy nhớ' },
    dd_s_line:       { en: 'Line', vi: 'Đường thẳng' },
    dd_s_arrow:      { en: 'Arrow', vi: 'Mũi tên' },
    dd_topic:        { en: 'Topic', vi: 'Chủ đề' },
    dd_add_topic:    { en: 'New central topic', vi: 'Chủ đề trung tâm mới' },
    dd_add_child:    { en: 'Add child (Tab)', vi: 'Thêm nhánh con (Tab)' },
    dd_add_sib:      { en: 'Add sibling (Enter)', vi: 'Thêm nhánh cùng cấp (Enter)' },
    dd_collapse:     { en: 'Collapse / expand branch', vi: 'Thu gọn / mở rộng nhánh' },
    dd_delete:       { en: 'Delete selection (Del)', vi: 'Xóa mục đã chọn (Del)' },
    dd_layout:       { en: 'Tidy layout', vi: 'Sắp xếp lại' },
    dd_layout_both:  { en: 'Both sides', vi: 'Hai bên' },
    dd_layout_right: { en: 'To the right', vi: 'Sang phải' },
    dd_dup:          { en: 'Duplicate (Ctrl+D)', vi: 'Nhân đôi (Ctrl+D)' },
    dd_outline:      { en: 'Outline', vi: 'Dàn ý' },
    dd_outline_h:    { en: 'Mind map outline', vi: 'Dàn ý sơ đồ tư duy' },
    dd_outline_tip:  { en: 'One topic per line; indent with spaces or a tab to make a sub-topic. Edit it, or paste your own, then build the map.', vi: 'Mỗi dòng một chủ đề; thụt lề bằng dấu cách hoặc phím Tab để tạo chủ đề con. Chỉnh sửa hoặc dán dàn ý của bạn rồi tạo sơ đồ.' },
    dd_outline_copy: { en: 'Copy', vi: 'Sao chép' },
    dd_outline_copied:{ en: 'Outline copied.', vi: 'Đã sao chép dàn ý.' },
    dd_outline_build:{ en: 'Build mind map', vi: 'Tạo sơ đồ tư duy' },
    dd_close:        { en: 'Close', vi: 'Đóng' },
    dd_png:          { en: 'Save page as picture (PNG)', vi: 'Lưu trang thành ảnh (PNG)' },
    dd_export:       { en: 'Save board as a file', vi: 'Lưu bảng thành tệp' },
    dd_import:       { en: 'Open a board file', vi: 'Mở tệp bảng' },
    dd_import_fail:  { en: 'That file isn’t a DrawDeck board.', vi: 'Tệp này không phải bảng DrawDeck.' },
    dd_share_start:  { en: 'Share this page with the class', vi: 'Chia sẻ trang này với lớp' },
    dd_share_stop:   { en: 'Stop sharing', vi: 'Ngừng chia sẻ' },
    dd_share_on:     { en: 'This page is now shown on students’ Shared Board.', vi: 'Trang này đang hiện trên Bảng chia sẻ của học sinh.' },
    dd_share_off:    { en: 'Stopped sharing.', vi: 'Đã ngừng chia sẻ.' },
    dd_share_fail:   { en: 'Couldn’t share this page — try again.', vi: 'Không chia sẻ được trang này — hãy thử lại.' },
    dd_share_need_class: { en: 'Link this board to a cloud class first (Cloud Class widget) to share with students.', vi: 'Hãy liên kết lớp học trên nền tảng đám mây trước (tiện ích Lớp học đám mây) để chia sẻ với học sinh.' },
    dd_share_too_big:{ en: 'This page is too detailed to share — try a simpler page or fewer images.', vi: 'Trang này quá nhiều chi tiết để chia sẻ — hãy thử trang đơn giản hơn hoặc ít ảnh hơn.' },
    dd_assign_start: { en: 'Assign this page to students', vi: 'Giao trang này cho học sinh' },
    dd_assign_ask:   { en: 'Assignment title:', vi: 'Tiêu đề bài tập:' },
    dd_assign_ok:    { en: 'Assigned — students can now draw their own answer.', vi: 'Đã giao bài — học sinh có thể vẽ câu trả lời của mình.' },
    dd_assign_fail:  { en: 'Couldn’t assign this page — try again.', vi: 'Không giao được bài — hãy thử lại.' },
    dd_focus:        { en: 'Hide the toolbars (F)', vi: 'Ẩn thanh công cụ (F)' },
    dd_unfocus:      { en: 'Show the toolbars', vi: 'Hiện thanh công cụ' },
    dd_save_fail:    { en: 'This browser can’t save boards here — your drawing will be lost when you close the tab.', vi: 'Trình duyệt này không lưu được bảng — bản vẽ sẽ mất khi đóng thẻ.' },
    dd_hint_draw:    { en: 'Pick a pen and start drawing. Ctrl + scroll to zoom, Space + drag to move around.', vi: 'Chọn bút và bắt đầu vẽ. Ctrl + cuộn để thu phóng, giữ Space và kéo để di chuyển.' },
    dd_hint_mind:    { en: 'Double-click to add a central topic, then press Tab for a branch and Enter for a sibling.', vi: 'Nhấp đúp để thêm chủ đề trung tâm, sau đó nhấn Tab để thêm nhánh con, Enter để thêm nhánh cùng cấp.' },
    dd_hint_flow:    { en: 'Choose a shape and drag to draw it, then use the connector to join shapes.', vi: 'Chọn một hình rồi kéo để vẽ, sau đó dùng đường nối để nối các hình.' },
    dd_text_ph:      { en: 'Type here…', vi: 'Nhập nội dung…' },
    dd_pdf:          { en: 'Save all pages as PDF', vi: 'Lưu mọi trang thành PDF' },
    dd_pdf_busy:     { en: 'Preparing the PDF…', vi: 'Đang tạo PDF…' },
    dd_t_image:      { en: 'Insert a picture', vi: 'Chèn hình ảnh' },
    dd_img_computer: { en: 'From this computer…', vi: 'Từ máy tính này…' },
    dd_img_files:    { en: 'From my Files', vi: 'Từ Tệp của tôi' },
    dd_img_none:     { en: 'No pictures in your Files yet.', vi: 'Chưa có hình ảnh nào trong Tệp của bạn.' },
    dd_img_fail:     { en: 'That could not be opened or saved.', vi: 'Không thể mở hoặc lưu mục này.' },
    dd_er_part:      { en: 'Erase parts', vi: 'Xóa từng phần' },
    dd_er_whole:     { en: 'Erase whole strokes', vi: 'Xóa cả nét' }
  };
  /* translations for the other languages the app offers (es, fr, zh, ja, ko, tl); anything missing falls back to English */
  var L2 = {
 "es": {
  "drawdeck": "🎨 DrawDeck",
  "wc_drawdeck": "Pizarra a pantalla completa con lápices, formas, mapas mentales y diagramas de flujo.",
  "dd_board": "Pizarras",
  "dd_new_board": "＋ Nueva pizarra",
  "dd_rename": "Cambiar nombre",
  "dd_rename_ask": "Nombre de la pizarra:",
  "dd_del_board": "Eliminar esta pizarra",
  "dd_del_board_q": "¿Eliminar esta pizarra y todas sus páginas?",
  "dd_untitled": "Pizarra {n}",
  "dd_page": "Página {n} de {total}",
  "dd_prev_page": "Página anterior",
  "dd_next_page": "Página siguiente",
  "dd_add_page": "Añadir página",
  "dd_dup_page": "Duplicar esta página",
  "dd_del_page": "Eliminar esta página",
  "dd_del_page_q": "¿Eliminar esta página?",
  "dd_clear_page": "Borrar esta página",
  "dd_clear_q": "¿Borrar todo en esta página? (Deshacer lo recupera.)",
  "dd_mode_draw": "Dibujo",
  "dd_mode_mind": "Mapa mental",
  "dd_mode_flow": "Diagrama de flujo",
  "dd_t_select": "Seleccionar y mover (V)",
  "dd_t_hand": "Desplazar (mantén Espacio)",
  "dd_t_pen": "Lápiz (P)",
  "dd_t_hl": "Resaltador (H)",
  "dd_t_eraser": "Borrador (E)",
  "dd_t_text": "Texto (T)",
  "dd_t_shape": "Formas (S)",
  "dd_t_conn": "Conector (C): arrastra de una forma a otra",
  "dd_undo": "Deshacer (Ctrl+Z)",
  "dd_redo": "Rehacer (Ctrl+Y)",
  "dd_zoom_in": "Acercar",
  "dd_zoom_out": "Alejar",
  "dd_zoom_fit": "Ajustar todo (1)",
  "dd_zoom_reset": "Volver al 100 % (0)",
  "dd_color": "Color",
  "dd_custom": "Elegir cualquier color",
  "dd_size": "Tamaño",
  "dd_fill": "Rellenar formas",
  "dd_bg": "Fondo",
  "dd_bg_white": "Pizarra blanca",
  "dd_bg_chalk": "Pizarra negra",
  "dd_bg_grid": "Cuadrícula",
  "dd_bg_lined": "Papel rayado",
  "dd_bg_graph": "Papel cuadriculado",
  "dd_bg_axes": "Ejes de coordenadas",
  "dd_bg_dots": "Puntos",
  "dd_s_rect": "Rectángulo",
  "dd_s_ellipse": "Elipse",
  "dd_s_diamond": "Decisión (rombo)",
  "dd_s_round": "Proceso",
  "dd_s_pill": "Inicio / fin",
  "dd_s_note": "Nota adhesiva",
  "dd_s_line": "Línea",
  "dd_s_arrow": "Flecha",
  "dd_topic": "Tema",
  "dd_add_topic": "Nuevo tema central",
  "dd_add_child": "Añadir rama (Tab)",
  "dd_add_sib": "Añadir rama del mismo nivel (Enter)",
  "dd_collapse": "Contraer / expandir rama",
  "dd_delete": "Eliminar selección (Supr)",
  "dd_layout": "Ordenar",
  "dd_layout_both": "Ambos lados",
  "dd_layout_right": "Hacia la derecha",
  "dd_dup": "Duplicar (Ctrl+D)",
  "dd_outline": "Esquema",
  "dd_outline_h": "Esquema del mapa mental",
  "dd_outline_tip": "Un tema por línea; usa sangría (espacios o tabulador) para crear subtemas. Edítalo o pega el tuyo y crea el mapa.",
  "dd_outline_copy": "Copiar",
  "dd_outline_copied": "Esquema copiado.",
  "dd_outline_build": "Crear mapa mental",
  "dd_close": "Cerrar",
  "dd_png": "Guardar página como imagen (PNG)",
  "dd_export": "Guardar pizarra como archivo",
  "dd_import": "Abrir archivo de pizarra",
  "dd_import_fail": "Ese archivo no es una pizarra de DrawDeck.",
  "dd_focus": "Ocultar barras de herramientas (F)",
  "dd_unfocus": "Mostrar barras de herramientas",
  "dd_save_fail": "Este navegador no puede guardar pizarras aquí: tu dibujo se perderá al cerrar la pestaña.",
  "dd_hint_draw": "Elige un lápiz y empieza a dibujar. Ctrl + rueda para acercar, Espacio + arrastrar para moverte.",
  "dd_hint_mind": "Haz doble clic para añadir un tema central; luego Tab añade una rama y Enter una del mismo nivel.",
  "dd_hint_flow": "Elige una forma y arrastra para dibujarla; luego usa el conector para unir formas.",
  "dd_text_ph": "Escribe aquí…",
  "dd_pdf": "Guardar todas las páginas como PDF",
  "dd_pdf_busy": "Preparando el PDF…",
  "dd_t_image": "Insertar imagen",
  "dd_img_computer": "Desde este equipo…",
  "dd_img_files": "Desde mis Archivos",
  "dd_img_none": "Aún no hay imágenes en tus Archivos.",
  "dd_img_fail": "No se pudo abrir o guardar.",
  "dd_er_part": "Borrar partes",
  "dd_er_whole": "Borrar trazos completos"
 },
 "fr": {
  "drawdeck": "🎨 DrawDeck",
  "wc_drawdeck": "Tableau plein écran avec stylos, formes, cartes mentales et organigrammes.",
  "dd_board": "Tableaux",
  "dd_new_board": "＋ Nouveau tableau",
  "dd_rename": "Renommer le tableau",
  "dd_rename_ask": "Nom du tableau :",
  "dd_del_board": "Supprimer ce tableau",
  "dd_del_board_q": "Supprimer ce tableau et toutes ses pages ?",
  "dd_untitled": "Tableau {n}",
  "dd_page": "Page {n} sur {total}",
  "dd_prev_page": "Page précédente",
  "dd_next_page": "Page suivante",
  "dd_add_page": "Ajouter une page",
  "dd_dup_page": "Dupliquer cette page",
  "dd_del_page": "Supprimer cette page",
  "dd_del_page_q": "Supprimer cette page ?",
  "dd_clear_page": "Effacer cette page",
  "dd_clear_q": "Tout effacer sur cette page ? (Annuler la restaure.)",
  "dd_mode_draw": "Dessin",
  "dd_mode_mind": "Carte mentale",
  "dd_mode_flow": "Organigramme",
  "dd_t_select": "Sélectionner et déplacer (V)",
  "dd_t_hand": "Déplacer la vue (maintenir Espace)",
  "dd_t_pen": "Stylo (P)",
  "dd_t_hl": "Surligneur (H)",
  "dd_t_eraser": "Gomme (E)",
  "dd_t_text": "Texte (T)",
  "dd_t_shape": "Formes (S)",
  "dd_t_conn": "Connecteur (C) : glisser d’une forme à l’autre",
  "dd_undo": "Annuler (Ctrl+Z)",
  "dd_redo": "Rétablir (Ctrl+Y)",
  "dd_zoom_in": "Zoom avant",
  "dd_zoom_out": "Zoom arrière",
  "dd_zoom_fit": "Tout afficher (1)",
  "dd_zoom_reset": "Revenir à 100 % (0)",
  "dd_color": "Couleur",
  "dd_custom": "Choisir une couleur",
  "dd_size": "Taille",
  "dd_fill": "Remplir les formes",
  "dd_bg": "Arrière-plan",
  "dd_bg_white": "Tableau blanc",
  "dd_bg_chalk": "Tableau noir",
  "dd_bg_grid": "Grille",
  "dd_bg_lined": "Papier ligné",
  "dd_bg_graph": "Papier quadrillé",
  "dd_bg_axes": "Axes de coordonnées",
  "dd_bg_dots": "Points",
  "dd_s_rect": "Rectangle",
  "dd_s_ellipse": "Ellipse",
  "dd_s_diamond": "Décision (losange)",
  "dd_s_round": "Traitement",
  "dd_s_pill": "Début / fin",
  "dd_s_note": "Note adhésive",
  "dd_s_line": "Ligne",
  "dd_s_arrow": "Flèche",
  "dd_topic": "Sujet",
  "dd_add_topic": "Nouveau sujet central",
  "dd_add_child": "Ajouter une branche (Tab)",
  "dd_add_sib": "Ajouter au même niveau (Entrée)",
  "dd_collapse": "Replier / déplier la branche",
  "dd_delete": "Supprimer la sélection (Suppr)",
  "dd_layout": "Réorganiser",
  "dd_layout_both": "Des deux côtés",
  "dd_layout_right": "Vers la droite",
  "dd_dup": "Dupliquer (Ctrl+D)",
  "dd_outline": "Plan",
  "dd_outline_h": "Plan de la carte mentale",
  "dd_outline_tip": "Un sujet par ligne ; indentez (espaces ou tabulation) pour créer des sous-sujets. Modifiez-le ou collez le vôtre, puis créez la carte.",
  "dd_outline_copy": "Copier",
  "dd_outline_copied": "Plan copié.",
  "dd_outline_build": "Créer la carte mentale",
  "dd_close": "Fermer",
  "dd_png": "Enregistrer la page en image (PNG)",
  "dd_export": "Enregistrer le tableau dans un fichier",
  "dd_import": "Ouvrir un fichier de tableau",
  "dd_import_fail": "Ce fichier n’est pas un tableau DrawDeck.",
  "dd_focus": "Masquer les barres d’outils (F)",
  "dd_unfocus": "Afficher les barres d’outils",
  "dd_save_fail": "Ce navigateur ne peut pas enregistrer les tableaux ici : votre dessin sera perdu à la fermeture de l’onglet.",
  "dd_hint_draw": "Choisissez un stylo et dessinez. Ctrl + molette pour zoomer, Espace + glisser pour vous déplacer.",
  "dd_hint_mind": "Double-cliquez pour ajouter un sujet central, puis Tab ajoute une branche et Entrée une branche du même niveau.",
  "dd_hint_flow": "Choisissez une forme et faites glisser pour la dessiner, puis reliez les formes avec le connecteur.",
  "dd_text_ph": "Saisissez ici…",
  "dd_pdf": "Enregistrer toutes les pages en PDF",
  "dd_pdf_busy": "Préparation du PDF…",
  "dd_t_image": "Insérer une image",
  "dd_img_computer": "Depuis cet ordinateur…",
  "dd_img_files": "Depuis mes Fichiers",
  "dd_img_none": "Aucune image dans vos Fichiers pour l’instant.",
  "dd_img_fail": "Impossible de l’ouvrir ou de l’enregistrer.",
  "dd_er_part": "Effacer des parties",
  "dd_er_whole": "Effacer les traits entiers"
 },
 "zh": {
  "drawdeck": "🎨 DrawDeck",
  "wc_drawdeck": "全屏白板：画笔、图形、思维导图和流程图。",
  "dd_board": "白板",
  "dd_new_board": "＋ 新建白板",
  "dd_rename": "重命名白板",
  "dd_rename_ask": "白板名称：",
  "dd_del_board": "删除此白板",
  "dd_del_board_q": "删除此白板及其所有页面？",
  "dd_untitled": "白板 {n}",
  "dd_page": "第 {n} 页，共 {total} 页",
  "dd_prev_page": "上一页",
  "dd_next_page": "下一页",
  "dd_add_page": "添加页面",
  "dd_dup_page": "复制此页",
  "dd_del_page": "删除此页",
  "dd_del_page_q": "删除此页？",
  "dd_clear_page": "清空此页",
  "dd_clear_q": "清空此页的所有内容？（可用撤销恢复。）",
  "dd_mode_draw": "绘画",
  "dd_mode_mind": "思维导图",
  "dd_mode_flow": "流程图",
  "dd_t_select": "选择和移动 (V)",
  "dd_t_hand": "平移（按住空格键）",
  "dd_t_pen": "画笔 (P)",
  "dd_t_hl": "荧光笔 (H)",
  "dd_t_eraser": "橡皮擦 (E)",
  "dd_t_text": "文字 (T)",
  "dd_t_shape": "图形 (S)",
  "dd_t_conn": "连接线 (C)：从一个图形拖到另一个图形",
  "dd_undo": "撤销 (Ctrl+Z)",
  "dd_redo": "重做 (Ctrl+Y)",
  "dd_zoom_in": "放大",
  "dd_zoom_out": "缩小",
  "dd_zoom_fit": "显示全部 (1)",
  "dd_zoom_reset": "恢复 100% (0)",
  "dd_color": "颜色",
  "dd_custom": "选择任意颜色",
  "dd_size": "大小",
  "dd_fill": "填充图形",
  "dd_bg": "背景",
  "dd_bg_white": "白板",
  "dd_bg_chalk": "黑板",
  "dd_bg_grid": "方格",
  "dd_bg_lined": "横线纸",
  "dd_bg_graph": "坐标纸",
  "dd_bg_axes": "坐标轴",
  "dd_bg_dots": "点阵",
  "dd_s_rect": "矩形",
  "dd_s_ellipse": "椭圆",
  "dd_s_diamond": "判断（菱形）",
  "dd_s_round": "处理",
  "dd_s_pill": "开始 / 结束",
  "dd_s_note": "便签",
  "dd_s_line": "直线",
  "dd_s_arrow": "箭头",
  "dd_topic": "主题",
  "dd_add_topic": "新建中心主题",
  "dd_add_child": "添加子分支 (Tab)",
  "dd_add_sib": "添加同级分支 (Enter)",
  "dd_collapse": "折叠 / 展开分支",
  "dd_delete": "删除所选 (Del)",
  "dd_layout": "整理布局",
  "dd_layout_both": "两侧",
  "dd_layout_right": "向右",
  "dd_dup": "复制 (Ctrl+D)",
  "dd_outline": "大纲",
  "dd_outline_h": "思维导图大纲",
  "dd_outline_tip": "每行一个主题；用空格或制表符缩进来创建子主题。可编辑或粘贴你自己的大纲，然后生成导图。",
  "dd_outline_copy": "复制",
  "dd_outline_copied": "大纲已复制。",
  "dd_outline_build": "生成思维导图",
  "dd_close": "关闭",
  "dd_png": "将此页保存为图片 (PNG)",
  "dd_export": "将白板保存为文件",
  "dd_import": "打开白板文件",
  "dd_import_fail": "该文件不是 DrawDeck 白板。",
  "dd_focus": "隐藏工具栏 (F)",
  "dd_unfocus": "显示工具栏",
  "dd_save_fail": "此浏览器无法在此保存白板，关闭标签页后你的绘图将丢失。",
  "dd_hint_draw": "选一支笔开始画吧。Ctrl + 滚轮缩放，空格 + 拖动可移动画面。",
  "dd_hint_mind": "双击添加中心主题，然后按 Tab 添加子分支，按 Enter 添加同级分支。",
  "dd_hint_flow": "选择一个图形并拖动绘制，然后用连接线把图形连起来。",
  "dd_text_ph": "在此输入…",
  "dd_pdf": "将所有页面保存为 PDF",
  "dd_pdf_busy": "正在生成 PDF…",
  "dd_t_image": "插入图片",
  "dd_img_computer": "从这台电脑…",
  "dd_img_files": "从我的文件",
  "dd_img_none": "你的文件中还没有图片。",
  "dd_img_fail": "无法打开或保存。",
  "dd_er_part": "擦除局部",
  "dd_er_whole": "擦除整条笔画"
 },
 "ja": {
  "drawdeck": "🎨 DrawDeck",
  "wc_drawdeck": "ペン、図形、マインドマップ、フローチャートが使える全画面ホワイトボード。",
  "dd_board": "ボード",
  "dd_new_board": "＋ 新しいボード",
  "dd_rename": "ボード名を変更",
  "dd_rename_ask": "ボード名：",
  "dd_del_board": "このボードを削除",
  "dd_del_board_q": "このボードとすべてのページを削除しますか？",
  "dd_untitled": "ボード {n}",
  "dd_page": "{total} ページ中 {n} ページ",
  "dd_prev_page": "前のページ",
  "dd_next_page": "次のページ",
  "dd_add_page": "ページを追加",
  "dd_dup_page": "このページを複製",
  "dd_del_page": "このページを削除",
  "dd_del_page_q": "このページを削除しますか？",
  "dd_clear_page": "このページを消去",
  "dd_clear_q": "このページの内容をすべて消去しますか？（元に戻すで復元できます。）",
  "dd_mode_draw": "描画",
  "dd_mode_mind": "マインドマップ",
  "dd_mode_flow": "フローチャート",
  "dd_t_select": "選択と移動 (V)",
  "dd_t_hand": "画面を移動（スペースキーを押す）",
  "dd_t_pen": "ペン (P)",
  "dd_t_hl": "蛍光ペン (H)",
  "dd_t_eraser": "消しゴム (E)",
  "dd_t_text": "テキスト (T)",
  "dd_t_shape": "図形 (S)",
  "dd_t_conn": "コネクタ (C)：図形から図形へドラッグ",
  "dd_undo": "元に戻す (Ctrl+Z)",
  "dd_redo": "やり直し (Ctrl+Y)",
  "dd_zoom_in": "拡大",
  "dd_zoom_out": "縮小",
  "dd_zoom_fit": "すべて表示 (1)",
  "dd_zoom_reset": "100% に戻す (0)",
  "dd_color": "色",
  "dd_custom": "好きな色を選ぶ",
  "dd_size": "太さ",
  "dd_fill": "図形を塗りつぶす",
  "dd_bg": "背景",
  "dd_bg_white": "ホワイトボード",
  "dd_bg_chalk": "黒板",
  "dd_bg_grid": "方眼",
  "dd_bg_lined": "罫線",
  "dd_bg_graph": "グラフ用紙",
  "dd_bg_axes": "座標軸",
  "dd_bg_dots": "ドット",
  "dd_s_rect": "四角形",
  "dd_s_ellipse": "楕円",
  "dd_s_diamond": "判断（ひし形）",
  "dd_s_round": "処理",
  "dd_s_pill": "開始 / 終了",
  "dd_s_note": "付箋",
  "dd_s_line": "線",
  "dd_s_arrow": "矢印",
  "dd_topic": "トピック",
  "dd_add_topic": "中心トピックを追加",
  "dd_add_child": "子ブランチを追加 (Tab)",
  "dd_add_sib": "同じ階層に追加 (Enter)",
  "dd_collapse": "ブランチを折りたたむ / 展開",
  "dd_delete": "選択を削除 (Del)",
  "dd_layout": "整列",
  "dd_layout_both": "両側",
  "dd_layout_right": "右へ",
  "dd_dup": "複製 (Ctrl+D)",
  "dd_outline": "アウトライン",
  "dd_outline_h": "マインドマップのアウトライン",
  "dd_outline_tip": "1行に1トピック。スペースやタブでインデントするとサブトピックになります。編集または貼り付けてからマップを作成してください。",
  "dd_outline_copy": "コピー",
  "dd_outline_copied": "アウトラインをコピーしました。",
  "dd_outline_build": "マインドマップを作成",
  "dd_close": "閉じる",
  "dd_png": "ページを画像 (PNG) で保存",
  "dd_export": "ボードをファイルとして保存",
  "dd_import": "ボードファイルを開く",
  "dd_import_fail": "このファイルは DrawDeck のボードではありません。",
  "dd_focus": "ツールバーを隠す (F)",
  "dd_unfocus": "ツールバーを表示",
  "dd_save_fail": "このブラウザではボードを保存できません。タブを閉じると描いた内容は失われます。",
  "dd_hint_draw": "ペンを選んで描き始めましょう。Ctrl + スクロールで拡大縮小、スペース + ドラッグで移動します。",
  "dd_hint_mind": "ダブルクリックで中心トピックを追加し、Tab で子ブランチ、Enter で同じ階層のブランチを追加します。",
  "dd_hint_flow": "図形を選んでドラッグして描き、コネクタで図形をつなぎます。",
  "dd_text_ph": "ここに入力…",
  "dd_pdf": "すべてのページを PDF で保存",
  "dd_pdf_busy": "PDF を作成中…",
  "dd_t_image": "画像を挿入",
  "dd_img_computer": "このコンピューターから…",
  "dd_img_files": "マイファイルから",
  "dd_img_none": "マイファイルに画像がまだありません。",
  "dd_img_fail": "開けないか、保存できませんでした。",
  "dd_er_part": "部分的に消す",
  "dd_er_whole": "ストローク全体を消す"
 },
 "ko": {
  "drawdeck": "🎨 DrawDeck",
  "wc_drawdeck": "펜, 도형, 마인드맵, 순서도를 쓸 수 있는 전체 화면 화이트보드.",
  "dd_board": "보드",
  "dd_new_board": "＋ 새 보드",
  "dd_rename": "보드 이름 변경",
  "dd_rename_ask": "보드 이름:",
  "dd_del_board": "이 보드 삭제",
  "dd_del_board_q": "이 보드와 모든 페이지를 삭제할까요?",
  "dd_untitled": "보드 {n}",
  "dd_page": "{total}페이지 중 {n}페이지",
  "dd_prev_page": "이전 페이지",
  "dd_next_page": "다음 페이지",
  "dd_add_page": "페이지 추가",
  "dd_dup_page": "이 페이지 복제",
  "dd_del_page": "이 페이지 삭제",
  "dd_del_page_q": "이 페이지를 삭제할까요?",
  "dd_clear_page": "이 페이지 지우기",
  "dd_clear_q": "이 페이지의 모든 내용을 지울까요? (실행 취소로 복구할 수 있습니다.)",
  "dd_mode_draw": "그리기",
  "dd_mode_mind": "마인드맵",
  "dd_mode_flow": "순서도",
  "dd_t_select": "선택 및 이동 (V)",
  "dd_t_hand": "화면 이동 (스페이스바 누르기)",
  "dd_t_pen": "펜 (P)",
  "dd_t_hl": "형광펜 (H)",
  "dd_t_eraser": "지우개 (E)",
  "dd_t_text": "텍스트 (T)",
  "dd_t_shape": "도형 (S)",
  "dd_t_conn": "연결선 (C): 한 도형에서 다른 도형으로 끌기",
  "dd_undo": "실행 취소 (Ctrl+Z)",
  "dd_redo": "다시 실행 (Ctrl+Y)",
  "dd_zoom_in": "확대",
  "dd_zoom_out": "축소",
  "dd_zoom_fit": "전체 보기 (1)",
  "dd_zoom_reset": "100%로 되돌리기 (0)",
  "dd_color": "색",
  "dd_custom": "원하는 색 선택",
  "dd_size": "굵기",
  "dd_fill": "도형 채우기",
  "dd_bg": "배경",
  "dd_bg_white": "화이트보드",
  "dd_bg_chalk": "칠판",
  "dd_bg_grid": "격자",
  "dd_bg_lined": "줄 노트",
  "dd_bg_graph": "모눈종이",
  "dd_bg_axes": "좌표축",
  "dd_bg_dots": "점",
  "dd_s_rect": "사각형",
  "dd_s_ellipse": "타원",
  "dd_s_diamond": "판단 (마름모)",
  "dd_s_round": "처리",
  "dd_s_pill": "시작 / 종료",
  "dd_s_note": "메모지",
  "dd_s_line": "선",
  "dd_s_arrow": "화살표",
  "dd_topic": "주제",
  "dd_add_topic": "새 중심 주제",
  "dd_add_child": "하위 가지 추가 (Tab)",
  "dd_add_sib": "같은 단계 가지 추가 (Enter)",
  "dd_collapse": "가지 접기 / 펼치기",
  "dd_delete": "선택 항목 삭제 (Del)",
  "dd_layout": "정렬",
  "dd_layout_both": "양쪽",
  "dd_layout_right": "오른쪽으로",
  "dd_dup": "복제 (Ctrl+D)",
  "dd_outline": "개요",
  "dd_outline_h": "마인드맵 개요",
  "dd_outline_tip": "한 줄에 주제 하나씩 입력하세요. 공백이나 탭으로 들여쓰면 하위 주제가 됩니다. 수정하거나 직접 붙여넣은 뒤 맵을 만드세요.",
  "dd_outline_copy": "복사",
  "dd_outline_copied": "개요를 복사했습니다.",
  "dd_outline_build": "마인드맵 만들기",
  "dd_close": "닫기",
  "dd_png": "페이지를 이미지(PNG)로 저장",
  "dd_export": "보드를 파일로 저장",
  "dd_import": "보드 파일 열기",
  "dd_import_fail": "DrawDeck 보드 파일이 아닙니다.",
  "dd_focus": "도구 모음 숨기기 (F)",
  "dd_unfocus": "도구 모음 표시",
  "dd_save_fail": "이 브라우저에서는 보드를 저장할 수 없습니다. 탭을 닫으면 그림이 사라집니다.",
  "dd_hint_draw": "펜을 골라 그려 보세요. Ctrl + 스크롤로 확대/축소, 스페이스 + 끌기로 이동합니다.",
  "dd_hint_mind": "더블클릭으로 중심 주제를 추가한 다음, Tab으로 하위 가지를, Enter로 같은 단계 가지를 추가하세요.",
  "dd_hint_flow": "도형을 골라 끌어서 그린 다음 연결선으로 도형을 이어 보세요.",
  "dd_text_ph": "여기에 입력…",
  "dd_pdf": "모든 페이지를 PDF로 저장",
  "dd_pdf_busy": "PDF 만드는 중…",
  "dd_t_image": "사진 삽입",
  "dd_img_computer": "이 컴퓨터에서…",
  "dd_img_files": "내 파일에서",
  "dd_img_none": "내 파일에 사진이 아직 없습니다.",
  "dd_img_fail": "열거나 저장할 수 없습니다.",
  "dd_er_part": "부분 지우기",
  "dd_er_whole": "획 전체 지우기"
 },
 "tl": {
  "drawdeck": "🎨 DrawDeck",
  "wc_drawdeck": "Full-screen na whiteboard na may panulat, hugis, mind map, at flowchart.",
  "dd_board": "Mga board",
  "dd_new_board": "＋ Bagong board",
  "dd_rename": "Palitan ang pangalan",
  "dd_rename_ask": "Pangalan ng board:",
  "dd_del_board": "Burahin ang board na ito",
  "dd_del_board_q": "Burahin ang board na ito at lahat ng pahina nito?",
  "dd_untitled": "Board {n}",
  "dd_page": "Pahina {n} ng {total}",
  "dd_prev_page": "Nakaraang pahina",
  "dd_next_page": "Susunod na pahina",
  "dd_add_page": "Magdagdag ng pahina",
  "dd_dup_page": "I-duplicate ang pahinang ito",
  "dd_del_page": "Burahin ang pahinang ito",
  "dd_del_page_q": "Burahin ang pahinang ito?",
  "dd_clear_page": "Linisin ang pahinang ito",
  "dd_clear_q": "Burahin ang lahat sa pahinang ito? (Maibabalik ng Undo.)",
  "dd_mode_draw": "Pagguhit",
  "dd_mode_mind": "Mind map",
  "dd_mode_flow": "Flowchart",
  "dd_t_select": "Pumili at ilipat (V)",
  "dd_t_hand": "Ilipat ang view (pindutin ang Space)",
  "dd_t_pen": "Panulat (P)",
  "dd_t_hl": "Highlighter (H)",
  "dd_t_eraser": "Pambura (E)",
  "dd_t_text": "Teksto (T)",
  "dd_t_shape": "Mga hugis (S)",
  "dd_t_conn": "Connector (C): i-drag mula sa isang hugis papunta sa isa pa",
  "dd_undo": "I-undo (Ctrl+Z)",
  "dd_redo": "I-redo (Ctrl+Y)",
  "dd_zoom_in": "Palakihin",
  "dd_zoom_out": "Paliitin",
  "dd_zoom_fit": "Ipakita lahat (1)",
  "dd_zoom_reset": "Ibalik sa 100% (0)",
  "dd_color": "Kulay",
  "dd_custom": "Pumili ng anumang kulay",
  "dd_size": "Laki",
  "dd_fill": "Punuin ang mga hugis",
  "dd_bg": "Background",
  "dd_bg_white": "Whiteboard",
  "dd_bg_chalk": "Blackboard",
  "dd_bg_grid": "Grid",
  "dd_bg_lined": "May linyang papel",
  "dd_bg_graph": "Graph paper",
  "dd_bg_axes": "Mga axis ng coordinate",
  "dd_bg_dots": "Mga tuldok",
  "dd_s_rect": "Parihaba",
  "dd_s_ellipse": "Elipse",
  "dd_s_diamond": "Desisyon (diamond)",
  "dd_s_round": "Proseso",
  "dd_s_pill": "Simula / wakas",
  "dd_s_note": "Sticky note",
  "dd_s_line": "Linya",
  "dd_s_arrow": "Palaso",
  "dd_topic": "Paksa",
  "dd_add_topic": "Bagong sentrong paksa",
  "dd_add_child": "Magdagdag ng sanga (Tab)",
  "dd_add_sib": "Magdagdag ng kapantay na sanga (Enter)",
  "dd_collapse": "I-collapse / i-expand ang sanga",
  "dd_delete": "Burahin ang napili (Del)",
  "dd_layout": "Ayusin",
  "dd_layout_both": "Magkabilang panig",
  "dd_layout_right": "Pakanan",
  "dd_dup": "I-duplicate (Ctrl+D)",
  "dd_outline": "Balangkas",
  "dd_outline_h": "Balangkas ng mind map",
  "dd_outline_tip": "Isang paksa bawat linya; gumamit ng indent (space o tab) para gumawa ng sub-paksa. I-edit ito o i-paste ang sarili mo, saka gawin ang mapa.",
  "dd_outline_copy": "Kopyahin",
  "dd_outline_copied": "Nakopya ang balangkas.",
  "dd_outline_build": "Gumawa ng mind map",
  "dd_close": "Isara",
  "dd_png": "I-save ang pahina bilang larawan (PNG)",
  "dd_export": "I-save ang board bilang file",
  "dd_import": "Magbukas ng board file",
  "dd_import_fail": "Hindi DrawDeck board ang file na iyon.",
  "dd_focus": "Itago ang mga toolbar (F)",
  "dd_unfocus": "Ipakita ang mga toolbar",
  "dd_save_fail": "Hindi makapag-save ng mga board ang browser na ito: mawawala ang iyong drawing kapag isinara ang tab.",
  "dd_hint_draw": "Pumili ng panulat at magsimulang gumuhit. Ctrl + scroll para mag-zoom, Space + drag para gumalaw.",
  "dd_hint_mind": "I-double-click para magdagdag ng sentrong paksa, saka Tab para sa sanga at Enter para sa kapantay na sanga.",
  "dd_hint_flow": "Pumili ng hugis at i-drag para iguhit, saka gamitin ang connector para pagdugtungin ang mga hugis.",
  "dd_text_ph": "Mag-type dito…",
  "dd_pdf": "I-save ang lahat ng pahina bilang PDF",
  "dd_pdf_busy": "Inihahanda ang PDF…",
  "dd_t_image": "Maglagay ng larawan",
  "dd_img_computer": "Mula sa computer na ito…",
  "dd_img_files": "Mula sa aking Files",
  "dd_img_none": "Wala pang larawan sa iyong Files.",
  "dd_img_fail": "Hindi mabuksan o mai-save.",
  "dd_er_part": "Burahin ang bahagi",
  "dd_er_whole": "Burahin ang buong guhit"
 }
};
  Object.keys(L2).forEach(function (lang) { Object.keys(L2[lang]).forEach(function (k) { if (S[k]) S[k][lang] = L2[lang][k]; }); });
  /* v0.24.0: math tools and templates. Template headings (tt_*) exist in English and Vietnamese only and fall back to English. */
  var S3 = {
 "dd_t_math": {
  "en": "Math tools",
  "vi": "Công cụ toán"
 },
 "dd_m_numline": {
  "en": "Number line",
  "vi": "Trục số"
 },
 "dd_m_ruler": {
  "en": "Ruler",
  "vi": "Thước kẻ"
 },
 "dd_m_protractor": {
  "en": "Protractor",
  "vi": "Thước đo góc"
 },
 "dd_m_fracbar": {
  "en": "Fraction bar",
  "vi": "Thanh phân số"
 },
 "dd_m_grid": {
  "en": "Table / grid",
  "vi": "Bảng / lưới"
 },
 "dd_m_compass": {
  "en": "Compass",
  "vi": "Com-pa"
 },
 "dd_props": {
  "en": "Properties…",
  "vi": "Thuộc tính…"
 },
 "dd_p_min": {
  "en": "Start at",
  "vi": "Bắt đầu từ"
 },
 "dd_p_max": {
  "en": "End at",
  "vi": "Kết thúc ở"
 },
 "dd_p_step": {
  "en": "Step",
  "vi": "Bước nhảy"
 },
 "dd_p_radius": {
  "en": "Radius",
  "vi": "Bán kính"
 },
 "dd_p_parts": {
  "en": "Number of parts",
  "vi": "Số phần"
 },
 "dd_p_labels": {
  "en": "Show fraction labels",
  "vi": "Hiện nhãn phân số"
 },
 "dd_p_rows": {
  "en": "Rows",
  "vi": "Số hàng"
 },
 "dd_p_cols": {
  "en": "Columns",
  "vi": "Số cột"
 },
 "dd_p_hdr": {
  "en": "Column headings (separate with commas; leave empty for none)",
  "vi": "Tiêu đề cột (cách nhau bằng dấu phẩy; để trống nếu không cần)"
 },
 "dd_p_seq": {
  "en": "Number the cells starting from (leave empty for none)",
  "vi": "Đánh số các ô bắt đầu từ (để trống nếu không cần)"
 },
 "dd_p_mult": {
  "en": "Multiplication table",
  "vi": "Bảng cửu chương"
 },
 "dd_p_unit": {
  "en": "Unit",
  "vi": "Đơn vị"
 },
 "dd_p_len": {
  "en": "Length",
  "vi": "Chiều dài"
 },
 "dd_u_cm": {
  "en": "Centimetres",
  "vi": "Xăng-ti-mét"
 },
 "dd_u_in": {
  "en": "Inches",
  "vi": "Inch"
 },
 "dd_apply": {
  "en": "Apply",
  "vi": "Áp dụng"
 },
 "dd_cancel": {
  "en": "Cancel",
  "vi": "Hủy"
 },
 "dd_bg_writing": {
  "en": "Handwriting lines",
  "vi": "Dòng kẻ tập viết"
 },
 "dd_tpl": {
  "en": "Starter templates",
  "vi": "Mẫu có sẵn"
 },
 "tpl_venn": {
  "en": "Venn diagram",
  "vi": "Sơ đồ Venn"
 },
 "tpl_tchart": {
  "en": "T-chart",
  "vi": "Bảng chữ T"
 },
 "tpl_kwl": {
  "en": "KWL chart",
  "vi": "Bảng KWL"
 },
 "tpl_place": {
  "en": "Place value chart",
  "vi": "Bảng giá trị theo hàng"
 },
 "tpl_100": {
  "en": "100 chart",
  "vi": "Bảng 100 số"
 },
 "tpl_mult": {
  "en": "Multiplication table",
  "vi": "Bảng cửu chương"
 },
 "tpl_fracwall": {
  "en": "Fraction wall",
  "vi": "Tường phân số"
 },
 "tpl_numline": {
  "en": "Number line 0–10",
  "vi": "Trục số 0–10"
 },
 "tpl_story": {
  "en": "Story map",
  "vi": "Sơ đồ câu chuyện"
 },
 "tpl_coord": {
  "en": "Coordinate plane",
  "vi": "Mặt phẳng tọa độ"
 },
 "tpl_writing": {
  "en": "Handwriting lines",
  "vi": "Dòng kẻ tập viết"
 },
 "tt_a": {
  "en": "Topic A",
  "vi": "Chủ đề A"
 },
 "tt_b": {
  "en": "Topic B",
  "vi": "Chủ đề B"
 },
 "tt_both": {
  "en": "Both",
  "vi": "Chung"
 },
 "tt_know": {
  "en": "Know",
  "vi": "Đã biết"
 },
 "tt_want": {
  "en": "Want to know",
  "vi": "Muốn biết"
 },
 "tt_learned": {
  "en": "Learned",
  "vi": "Đã học"
 },
 "tt_th": {
  "en": "Thousands",
  "vi": "Nghìn"
 },
 "tt_h": {
  "en": "Hundreds",
  "vi": "Trăm"
 },
 "tt_te": {
  "en": "Tens",
  "vi": "Chục"
 },
 "tt_o": {
  "en": "Ones",
  "vi": "Đơn vị"
 },
 "tt_char": {
  "en": "Characters",
  "vi": "Nhân vật"
 },
 "tt_set": {
  "en": "Setting",
  "vi": "Bối cảnh"
 },
 "tt_prob": {
  "en": "Problem",
  "vi": "Vấn đề"
 },
 "tt_ev": {
  "en": "Events",
  "vi": "Sự kiện"
 },
 "tt_sol": {
  "en": "Solution",
  "vi": "Giải pháp"
 }
};
  Object.keys(S3).forEach(function (k) { S[k] = S3[k]; });
  var L3 = {
 "es": {
  "dd_t_math": "Herramientas de matemáticas",
  "dd_m_numline": "Recta numérica",
  "dd_m_ruler": "Regla",
  "dd_m_protractor": "Transportador",
  "dd_m_fracbar": "Barra de fracciones",
  "dd_m_grid": "Tabla / cuadrícula",
  "dd_props": "Propiedades…",
  "dd_p_min": "Empezar en",
  "dd_p_max": "Terminar en",
  "dd_p_step": "Paso",
  "dd_p_parts": "Número de partes",
  "dd_p_labels": "Mostrar etiquetas de fracción",
  "dd_p_rows": "Filas",
  "dd_p_cols": "Columnas",
  "dd_p_hdr": "Encabezados de columna (separados por comas; vacío si no hay)",
  "dd_p_seq": "Numerar las celdas desde (vacío si no)",
  "dd_p_mult": "Tabla de multiplicar",
  "dd_p_unit": "Unidad",
  "dd_p_len": "Longitud",
  "dd_u_cm": "Centímetros",
  "dd_u_in": "Pulgadas",
  "dd_apply": "Aplicar",
  "dd_cancel": "Cancelar",
  "dd_bg_writing": "Líneas de caligrafía",
  "dd_tpl": "Plantillas",
  "tpl_venn": "Diagrama de Venn",
  "tpl_tchart": "Tabla en T",
  "tpl_kwl": "Tabla SQA",
  "tpl_place": "Tabla de valor posicional",
  "tpl_100": "Tabla del 100",
  "tpl_mult": "Tabla de multiplicar",
  "tpl_fracwall": "Muro de fracciones",
  "tpl_numline": "Recta numérica 0–10",
  "tpl_story": "Mapa del cuento",
  "tpl_coord": "Plano cartesiano",
  "tpl_writing": "Líneas de caligrafía"
 },
 "fr": {
  "dd_t_math": "Outils de maths",
  "dd_m_numline": "Droite numérique",
  "dd_m_ruler": "Règle",
  "dd_m_protractor": "Rapporteur",
  "dd_m_fracbar": "Barre de fractions",
  "dd_m_grid": "Tableau / grille",
  "dd_props": "Propriétés…",
  "dd_p_min": "Commencer à",
  "dd_p_max": "Finir à",
  "dd_p_step": "Pas",
  "dd_p_parts": "Nombre de parties",
  "dd_p_labels": "Afficher les étiquettes de fraction",
  "dd_p_rows": "Lignes",
  "dd_p_cols": "Colonnes",
  "dd_p_hdr": "Titres des colonnes (séparés par des virgules ; vide pour aucun)",
  "dd_p_seq": "Numéroter les cases à partir de (vide pour aucun)",
  "dd_p_mult": "Table de multiplication",
  "dd_p_unit": "Unité",
  "dd_p_len": "Longueur",
  "dd_u_cm": "Centimètres",
  "dd_u_in": "Pouces",
  "dd_apply": "Appliquer",
  "dd_cancel": "Annuler",
  "dd_bg_writing": "Lignes d’écriture",
  "dd_tpl": "Modèles",
  "tpl_venn": "Diagramme de Venn",
  "tpl_tchart": "Tableau en T",
  "tpl_kwl": "Tableau SVA",
  "tpl_place": "Tableau de numération",
  "tpl_100": "Tableau de 100",
  "tpl_mult": "Table de multiplication",
  "tpl_fracwall": "Mur des fractions",
  "tpl_numline": "Droite numérique 0–10",
  "tpl_story": "Schéma du récit",
  "tpl_coord": "Plan cartésien",
  "tpl_writing": "Lignes d’écriture"
 },
 "zh": {
  "dd_t_math": "数学工具",
  "dd_m_numline": "数轴",
  "dd_m_ruler": "直尺",
  "dd_m_protractor": "量角器",
  "dd_m_fracbar": "分数条",
  "dd_m_grid": "表格 / 方格",
  "dd_props": "属性…",
  "dd_p_min": "起点",
  "dd_p_max": "终点",
  "dd_p_step": "间隔",
  "dd_p_parts": "份数",
  "dd_p_labels": "显示分数标签",
  "dd_p_rows": "行数",
  "dd_p_cols": "列数",
  "dd_p_hdr": "列标题（用逗号分隔；留空表示没有）",
  "dd_p_seq": "从此数开始给方格编号（留空表示不编号）",
  "dd_p_mult": "乘法表",
  "dd_p_unit": "单位",
  "dd_p_len": "长度",
  "dd_u_cm": "厘米",
  "dd_u_in": "英寸",
  "dd_apply": "应用",
  "dd_cancel": "取消",
  "dd_bg_writing": "书写练习线",
  "dd_tpl": "模板",
  "tpl_venn": "韦恩图",
  "tpl_tchart": "T 形图",
  "tpl_kwl": "KWL 图",
  "tpl_place": "数位表",
  "tpl_100": "百数表",
  "tpl_mult": "乘法表",
  "tpl_fracwall": "分数墙",
  "tpl_numline": "数轴 0–10",
  "tpl_story": "故事图",
  "tpl_coord": "坐标平面",
  "tpl_writing": "书写练习线"
 },
 "ja": {
  "dd_t_math": "算数ツール",
  "dd_m_numline": "数直線",
  "dd_m_ruler": "定規",
  "dd_m_protractor": "分度器",
  "dd_m_fracbar": "分数バー",
  "dd_m_grid": "表 / マス目",
  "dd_props": "プロパティ…",
  "dd_p_min": "開始",
  "dd_p_max": "終了",
  "dd_p_step": "目盛り間隔",
  "dd_p_parts": "分割数",
  "dd_p_labels": "分数ラベルを表示",
  "dd_p_rows": "行数",
  "dd_p_cols": "列数",
  "dd_p_hdr": "列の見出し（カンマ区切り、空欄でなし）",
  "dd_p_seq": "マスの番号の開始値（空欄でなし）",
  "dd_p_mult": "九九の表",
  "dd_p_unit": "単位",
  "dd_p_len": "長さ",
  "dd_u_cm": "センチメートル",
  "dd_u_in": "インチ",
  "dd_apply": "適用",
  "dd_cancel": "キャンセル",
  "dd_bg_writing": "書き方練習の罫線",
  "dd_tpl": "テンプレート",
  "tpl_venn": "ベン図",
  "tpl_tchart": "Tチャート",
  "tpl_kwl": "KWLチャート",
  "tpl_place": "位取り表",
  "tpl_100": "百マス表",
  "tpl_mult": "九九の表",
  "tpl_fracwall": "分数の壁",
  "tpl_numline": "数直線 0–10",
  "tpl_story": "ストーリーマップ",
  "tpl_coord": "座標平面",
  "tpl_writing": "書き方練習の罫線"
 },
 "ko": {
  "dd_t_math": "수학 도구",
  "dd_m_numline": "수직선",
  "dd_m_ruler": "자",
  "dd_m_protractor": "각도기",
  "dd_m_fracbar": "분수 막대",
  "dd_m_grid": "표 / 격자",
  "dd_props": "속성…",
  "dd_p_min": "시작값",
  "dd_p_max": "끝값",
  "dd_p_step": "간격",
  "dd_p_parts": "칸 수",
  "dd_p_labels": "분수 표시",
  "dd_p_rows": "행",
  "dd_p_cols": "열",
  "dd_p_hdr": "열 제목(쉼표로 구분, 비우면 없음)",
  "dd_p_seq": "칸 번호 시작값(비우면 번호 없음)",
  "dd_p_mult": "구구단 표",
  "dd_p_unit": "단위",
  "dd_p_len": "길이",
  "dd_u_cm": "센티미터",
  "dd_u_in": "인치",
  "dd_apply": "적용",
  "dd_cancel": "취소",
  "dd_bg_writing": "글씨 연습 줄",
  "dd_tpl": "템플릿",
  "tpl_venn": "벤 다이어그램",
  "tpl_tchart": "T 차트",
  "tpl_kwl": "KWL 차트",
  "tpl_place": "자릿값 표",
  "tpl_100": "100 표",
  "tpl_mult": "구구단 표",
  "tpl_fracwall": "분수 벽",
  "tpl_numline": "수직선 0–10",
  "tpl_story": "이야기 지도",
  "tpl_coord": "좌표평면",
  "tpl_writing": "글씨 연습 줄"
 },
 "tl": {
  "dd_t_math": "Mga kasangkapan sa Math",
  "dd_m_numline": "Number line",
  "dd_m_ruler": "Ruler",
  "dd_m_protractor": "Protractor",
  "dd_m_fracbar": "Fraction bar",
  "dd_m_grid": "Table / grid",
  "dd_props": "Mga katangian…",
  "dd_p_min": "Magsimula sa",
  "dd_p_max": "Magtapos sa",
  "dd_p_step": "Hakbang",
  "dd_p_parts": "Bilang ng bahagi",
  "dd_p_labels": "Ipakita ang label ng fraction",
  "dd_p_rows": "Mga hilera",
  "dd_p_cols": "Mga hanay",
  "dd_p_hdr": "Mga pamagat ng hanay (paghiwalayin ng kuwit; iwanang blangko kung wala)",
  "dd_p_seq": "Bilangin ang mga cell simula sa (iwanang blangko kung wala)",
  "dd_p_mult": "Multiplication table",
  "dd_p_unit": "Yunit",
  "dd_p_len": "Haba",
  "dd_u_cm": "Sentimetro",
  "dd_u_in": "Pulgada",
  "dd_apply": "Ilapat",
  "dd_cancel": "Kanselahin",
  "dd_bg_writing": "Mga linya ng pagsulat",
  "dd_tpl": "Mga template",
  "tpl_venn": "Venn diagram",
  "tpl_tchart": "T-chart",
  "tpl_kwl": "KWL chart",
  "tpl_place": "Place value chart",
  "tpl_100": "100 chart",
  "tpl_mult": "Multiplication table",
  "tpl_fracwall": "Fraction wall",
  "tpl_numline": "Number line 0–10",
  "tpl_story": "Story map",
  "tpl_coord": "Coordinate plane",
  "tpl_writing": "Mga linya ng pagsulat"
 }
};
  Object.keys(L3).forEach(function (lang) { Object.keys(L3[lang]).forEach(function (k) { if (S[k]) S[k][lang] = L3[lang][k]; }); });

  /* ---------------- small helpers ---------------- */
  var NS = 'http://www.w3.org/2000/svg';
  var FONT = "Inter, 'Segoe UI', system-ui, sans-serif";
  var PALETTE = ['#1a1a1a', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#ec407a'];
  var BRANCH = ['#e53935', '#fb8c00', '#43a047', '#00acc1', '#1e88e5', '#8e24aa', '#ec407a', '#f9a825'];
  var SIZES = [2, 4, 8, 14, 24];
  var TEXT_SIZES = [16, 22, 30, 42, 60];
  var BGS = ['white', 'chalk', 'grid', 'lined', 'writing', 'graph', 'axes', 'dots'];
  var DRAW_SHAPES = ['line', 'arrow', 'rect', 'ellipse', 'diamond'];
  var FLOW_SHAPES = ['round', 'diamond', 'pill', 'rect', 'ellipse', 'note'];
  var HGAP = 64, VGAP = 14, NODE_MAX = 240;
  var LS_KEY = 'td_drawdeck_v1';
  var STORE = 'boards';

  function uid() { return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function icon(path) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + path + '</svg>'; }
  var IC = {
    math: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>',
    tpl: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>',
    select: '<path d="M5 3l13 7.5-5.5 1.8L10 18 5 3Z"/>',
    hand: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4-2L4 14.5a1.5 1.5 0 0 1 2.3-1.9L8 14"/>',
    pen: '<path d="M4 20l1.2-4.3L16 5l3 3L8.3 18.8 4 20Z"/><path d="M14 7l3 3"/>',
    hl: '<path d="M5 20h14"/><path d="M8 16l7-8 3 3-7 8H8v-3Z"/>',
    eraser: '<path d="M4 15l8-9 7 7-5 5H8l-4-3Z"/><path d="M9 11l6 6"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    shape: '<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/><circle cx="16" cy="16" r="4.5"/>',
    conn: '<circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M7 12h9M13.5 9l3 3-3 3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    focus: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    topic: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
    child: '<rect x="3" y="9" width="7" height="6" rx="2"/><rect x="15" y="4" width="6" height="5" rx="2"/><rect x="15" y="15" width="6" height="5" rx="2"/><path d="M10 12h2.5V6.5H15M12.5 12v5.5H15"/>',
    sib: '<rect x="3" y="4" width="8" height="5" rx="2"/><rect x="3" y="15" width="8" height="5" rx="2"/><path d="M7 9v6M15 12h6M18 9v6"/>',
    collapse: '<circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
    layout: '<path d="M4 6h6v4H4zM14 4h6v4h-6zM14 12h6v4h-6zM4 14h6v4H4z"/><path d="M10 8h2v-2h2M10 16h2v-2h2"/>',
    dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    outline: '<path d="M5 6h14M9 12h10M13 18h6"/>',
    bg: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>'
  };

  var mg = null; // shared measuring context
  function mctx() { if (!mg) mg = document.createElement('canvas').getContext('2d'); return mg; }

  function wrapText(g, text, maxW) {
    var out = [];
    String(text == null ? '' : text).split('\n').forEach(function (para) {
      if (!para) { out.push(''); return; }
      var line = '';
      para.split(/(\s+)/).forEach(function (w) {
        if (!w) return;
        var test = line + w;
        if (line && g.measureText(test).width > maxW && /\S/.test(w)) { out.push(line.replace(/\s+$/, '')); line = w.replace(/^\s+/, ''); }
        else line = test;
        while (g.measureText(line).width > maxW && line.length > 1) {   // a single very long word
          var cut = line.length - 1;
          while (cut > 1 && g.measureText(line.slice(0, cut)).width > maxW) cut--;
          out.push(line.slice(0, cut)); line = line.slice(cut);
        }
      });
      out.push(line.replace(/\s+$/, ''));
    });
    return out.length ? out : [''];
  }
  function lum(hex) {
    var m = /^#([0-9a-f]{6})/i.exec(hex || ''); if (!m) return 0;
    var n = parseInt(m[1], 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  function inkOn(fill) { return lum(fill) > 0.62 ? '#1a1a1a' : '#ffffff'; }
  function tint(hex, a) { var m = /^#([0-9a-f]{6})/i.exec(hex || ''); return m ? '#' + m[1] + a : hex; }

  /* ---------------- geometry ---------------- */
  function distSeg(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy, t = l2 ? clamp(((px - x1) * dx + (py - y1) * dy) / l2, 0, 1) : 0;
    var cx = x1 + t * dx, cy = y1 + t * dy; return Math.hypot(px - cx, py - cy);
  }
  function isLine(o) { return o.t === 'shape' && (o.k === 'line' || o.k === 'arrow'); }
  /* ---------------- math lesson tools (v0.24.0): number line, ruler, protractor, fraction bar, table ---------------- */
  var K = 40;   // world pixels per centimetre on the ruler
  var MATH = { numline: 1, ruler: 1, protractor: 1, fracbar: 1, grid: 1, compass: 1 }, ROT = { numline: 1, ruler: 1, protractor: 1, compass: 1 };
  function worldPt(o, lx, ly) {                // a point given relative to the object's top-left (before rotation) -> board position
    var a = o.a || 0, dx = lx - o.w / 2, dy = ly - o.h / 2;
    return { x: o.x + o.w / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: o.y + o.h / 2 + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function localPt(o, x, y) {                  // a board position -> relative to the object's top-left (undoing rotation)
    var a = o.a || 0, dx = x - (o.x + o.w / 2), dy = y - (o.y + o.h / 2);
    return [dx * Math.cos(a) + dy * Math.sin(a) + o.w / 2, -dx * Math.sin(a) + dy * Math.cos(a) + o.h / 2];
  }
  function fitTL(old, w, h) {                  // new size with the top-left corner kept where it is, also when rotated
    var tl = worldPt(old, 0, 0), a = old.a || 0;
    var cx = tl.x + (w / 2) * Math.cos(a) - (h / 2) * Math.sin(a), cy = tl.y + (w / 2) * Math.sin(a) + (h / 2) * Math.cos(a);
    return { x: r1(cx - w / 2), y: r1(cy - h / 2), w: r1(w), h: r1(h) };
  }
  function sizeFor(o, w, h) {
    if (o.t === 'image') { w = Math.max(30, w); return [w, w * (o.nh / o.nw)]; }
    if (o.t === 'ruler') { var per = o.unit === 'in' ? K * 2.54 : K; return [Math.max(per * 3, Math.round(w / per) * per), o.h]; }
    if (o.t === 'numline') return [Math.max(200, w), o.h];
    if (o.t === 'protractor') { w = Math.max(200, w); return [w, w / 2 + 24]; }
    if (o.t === 'fracbar') return [Math.max(120, w), Math.max(30, h)];
    if (o.t === 'grid') return [Math.max(80, w), Math.max(60, h)];
    if (o.t === 'compass') { w = Math.max(80, w); return [w, w]; }   // always a perfect circle — drag any corner, the radius follows
    return [Math.max(30, w), Math.max(24, h)];
  }
  function resizable(o) { return (o.t === 'shape' && !isLine(o)) || o.t === 'image' || !!MATH[o.t]; }
  function fmtNum(v) { return String(Math.round(v * 1000) / 1000); }
  function fitFont(c, text, maxW, fs, weight) { c.font = weight + ' ' + fs + 'px ' + FONT; while (fs > 9 && c.measureText(text).width > maxW) { fs -= 1; c.font = weight + ' ' + fs + 'px ' + FONT; } return fs; }
  function drawMath(c, o, ink) {
    c.save();
    if (o.a) { c.translate(o.x + o.w / 2, o.y + o.h / 2); c.rotate(o.a); c.translate(-o.w / 2, -o.h / 2); } else c.translate(o.x, o.y);
    var w = o.w, h = o.h, i;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.t === 'numline') {
      var pad = 34, y = 26, n = Math.max(1, Math.min(200, Math.round((o.max - o.min) / o.step))), st = (w - 2 * pad) / n, every = Math.max(1, Math.ceil(26 / st));
      c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 3; c.beginPath(); c.moveTo(6, y); c.lineTo(w - 6, y); c.stroke();
      c.beginPath(); c.moveTo(6, y); c.lineTo(18, y - 7); c.lineTo(18, y + 7); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(w - 6, y); c.lineTo(w - 18, y - 7); c.lineTo(w - 18, y + 7); c.closePath(); c.fill();
      c.font = '600 ' + clamp(st * 0.5, 12, 22) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 2.5;
      for (i = 0; i <= n; i++) {
        var x = pad + i * st; c.beginPath(); c.moveTo(x, y - 9); c.lineTo(x, y + 9); c.stroke();
        if (i % every === 0) c.fillText(fmtNum(o.min + i * (o.max - o.min) / n), x, y + 14);
      }
    } else if (o.t === 'ruler') {
      c.fillStyle = 'rgba(255,214,102,.92)'; c.strokeStyle = '#8a6d00'; c.lineWidth = 1.5; c.beginPath(); c.roundRect(0, 0, w, h, 6); c.fill(); c.stroke();
      c.strokeStyle = '#3a2f00'; c.fillStyle = '#3a2f00'; c.lineWidth = 1.2; c.font = '600 11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top';
      if (o.unit === 'in') {
        var per = K * 2.54, tot = Math.floor(w / per * 16);
        for (i = 0; i <= tot; i++) { var xi = i * per / 16, L = i % 16 === 0 ? 22 : i % 8 === 0 ? 17 : i % 4 === 0 ? 12 : i % 2 === 0 ? 8 : 5; c.beginPath(); c.moveTo(xi, 0); c.lineTo(xi, L); c.stroke(); if (i % 16 === 0 && i > 0) c.fillText(String(i / 16), xi, L + 3); }
      } else {
        var pm = K / 10, totm = Math.floor(w / pm);
        for (i = 0; i <= totm; i++) { var xm = i * pm, Lm = i % 10 === 0 ? 22 : i % 5 === 0 ? 15 : 8; c.beginPath(); c.moveTo(xm, 0); c.lineTo(xm, Lm); c.stroke(); if (i % 10 === 0 && i > 0) c.fillText(String(i / 10), xm, Lm + 3); }
      }
      c.textAlign = 'right'; c.textBaseline = 'bottom'; c.font = '700 12px ' + FONT; c.fillText(o.unit === 'in' ? 'in' : 'cm', w - 8, h - 4);
    } else if (o.t === 'protractor') {
      var r = w / 2;
      c.beginPath(); c.moveTo(0, r); c.arc(r, r, r, Math.PI, 2 * Math.PI); c.lineTo(w, r + 24); c.lineTo(0, r + 24); c.closePath();
      c.fillStyle = 'rgba(120,200,255,.30)'; c.fill(); c.strokeStyle = '#2b6cb0'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(0, r); c.lineTo(w, r); c.stroke();
      c.lineWidth = 1.2; c.beginPath();
      for (i = 0; i <= 180; i++) {
        if (r * Math.PI / 180 < 2.2 && i % 5) continue;
        var ang = i * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang), Lp = i % 10 === 0 ? 18 : i % 5 === 0 ? 13 : 7;
        c.moveTo(r + r * ca, r - r * sa); c.lineTo(r + (r - Lp) * ca, r - (r - Lp) * sa);
      }
      c.stroke();
      c.font = '600 11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (i = 0; i <= 180; i += 10) {
        var an = i * Math.PI / 180, cs = Math.cos(an), sn = Math.sin(an);
        c.fillStyle = '#1a365d'; c.fillText(String(i), r + (r - 30) * cs, r - (r - 30) * sn);
        c.fillStyle = 'rgba(26,54,93,.55)'; c.fillText(String(180 - i), r + (r - 50) * cs, r - (r - 50) * sn);
      }
      c.strokeStyle = '#2b6cb0'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(r - 10, r); c.lineTo(r + 10, r); c.moveTo(r, r - 10); c.lineTo(r, r + 10); c.stroke();
      c.beginPath(); c.arc(r, r, 3.5, 0, 6.2832); c.fillStyle = '#2b6cb0'; c.fill();
    } else if (o.t === 'fracbar') {
      var np = Math.max(1, o.n || 1), pw = w / np, sh = o.sh || [];
      for (i = 0; i < np; i++) {
        c.beginPath(); c.rect(i * pw, 0, pw, h);
        if (sh.indexOf(i) > -1) { c.globalAlpha = 0.78; c.fillStyle = o.c || '#1e88e5'; c.fill(); c.globalAlpha = 1; }
        c.lineWidth = 2; c.strokeStyle = ink; c.stroke();
        if (o.lab && pw >= 26) { var lbl = '1/' + np; c.fillStyle = sh.indexOf(i) > -1 ? inkOn(o.c || '#1e88e5') : ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 ' + fitFont(c, lbl, pw - 8, Math.min(22, h * 0.5), 600) + 'px ' + FONT; c.fillText(lbl, i * pw + pw / 2, h / 2 + 1); }
      }
    } else if (o.t === 'grid') {
      var rows = Math.max(1, o.rows || 1), cols = Math.max(1, o.cols || 1), hdr = (o.hdr && o.hdr.length) ? o.hdr : null, mult = !!o.mult, col = o.c || '#1e88e5';
      var tr = mult ? rows + 1 : rows + (hdr ? 1 : 0), tc = mult ? cols + 1 : cols;
      var hh = mult ? h / tr : (hdr ? Math.min(56, h / tr) : 0), bh = mult ? h / tr : (h - hh) / rows, cw = w / tc;
      c.fillStyle = tint(col, '30');
      if (mult) { c.fillRect(0, 0, w, bh); c.fillRect(0, 0, cw, h); } else if (hdr) c.fillRect(0, 0, w, hh);
      c.strokeStyle = ink; c.lineWidth = 2; c.strokeRect(0, 0, w, h); c.lineWidth = 1.2; c.beginPath();
      for (i = 1; i < tr; i++) { var yy = mult ? i * bh : (hdr ? hh + (i - 1) * bh : i * bh); if (!mult && hdr) yy = i === 1 ? hh : hh + (i - 1) * bh; c.moveTo(0, yy); c.lineTo(w, yy); }
      for (i = 1; i < tc; i++) { c.moveTo(i * cw, 0); c.lineTo(i * cw, h); }
      c.stroke(); c.fillStyle = ink; c.textAlign = 'center'; c.textBaseline = 'middle';
      if (mult) {
        for (var rr = 0; rr < tr; rr++) for (var cc = 0; cc < tc; cc++) { if (!rr && !cc) continue; var val = String((rr || 1) * (cc || 1)); if (!rr) val = String(cc); else if (!cc) val = String(rr); c.font = (!rr || !cc ? 700 : 500) + ' ' + fitFont(c, val, cw - 6, Math.min(26, Math.min(cw, bh) * 0.46), !rr || !cc ? 700 : 500) + 'px ' + FONT; c.fillText(val, cc * cw + cw / 2, rr * bh + bh / 2 + 1); }
      } else {
        if (hdr) for (i = 0; i < cols; i++) { var ht = String(hdr[i] == null ? '' : hdr[i]); if (!ht) continue; c.font = '700 ' + fitFont(c, ht, cw - 12, Math.min(24, hh * 0.5), 700) + 'px ' + FONT; c.fillText(ht, i * cw + cw / 2, hh / 2 + 1); }
        if (o.seq != null && o.seq !== '') for (var r2 = 0; r2 < rows; r2++) for (var c2 = 0; c2 < cols; c2++) { var sv = String(o.seq + r2 * cols + c2); c.font = '500 ' + fitFont(c, sv, cw - 6, Math.min(30, Math.min(cw, bh) * 0.42), 500) + 'px ' + FONT; c.fillText(sv, c2 * cw + cw / 2, hh + r2 * bh + bh / 2 + 1); }
      }
    } else if (o.t === 'compass') {
      var rpx = w / 2, ccol = '#6d28d9';
      c.strokeStyle = ccol; c.fillStyle = ccol; c.lineWidth = 2.5;
      c.beginPath(); c.arc(rpx, rpx, rpx - 1.5, 0, 6.2832); c.stroke();
      c.save(); c.setLineDash([5, 4]); c.lineWidth = 1.6; c.beginPath(); c.moveTo(rpx, rpx); c.lineTo(w - 2, rpx); c.stroke(); c.restore();
      c.beginPath(); c.arc(rpx, rpx, 3.5, 0, 6.2832); c.fill();
      c.beginPath(); c.arc(w - 2, rpx, 3, 0, 6.2832); c.fill();
      var rlen = rpx / (o.unit === 'in' ? K * 2.54 : K), rlbl = fmtNum(rlen) + (o.unit === 'in' ? ' in' : ' cm');
      c.font = '600 12px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'bottom';
      c.fillText(rlbl, rpx + rpx / 2, rpx - 6);
    }
    c.restore();
  }
  function bboxOf(o) {
    if (o.b) return o.b;
    if (o.a && o.w != null) {
      var cs = [worldPt(o, 0, 0), worldPt(o, o.w, 0), worldPt(o, o.w, o.h), worldPt(o, 0, o.h)];
      return [Math.min.apply(null, cs.map(function (q) { return q.x; })), Math.min.apply(null, cs.map(function (q) { return q.y; })), Math.max.apply(null, cs.map(function (q) { return q.x; })), Math.max.apply(null, cs.map(function (q) { return q.y; }))];
    }
    if (o.t === 'shape' && isLine(o)) return [Math.min(o.x, o.x + o.w), Math.min(o.y, o.y + o.h), Math.max(o.x, o.x + o.w), Math.max(o.y, o.y + o.h)];
    return [o.x, o.y, o.x + (o.w || 0), o.y + (o.h || 0)];
  }
  function edgePoint(s, tx, ty) {
    var cx = s.x + s.w / 2, cy = s.y + s.h / 2, dx = tx - cx, dy = ty - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    var a = s.w / 2 || 1, b = s.h / 2 || 1, t;
    if (s.k === 'ellipse') t = 1 / Math.sqrt((dx / a) * (dx / a) + (dy / b) * (dy / b));
    else if (s.k === 'diamond') t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
    else t = 1 / Math.max(Math.abs(dx) / a, Math.abs(dy) / b);
    return { x: cx + dx * t, y: cy + dy * t };
  }
  function translate(o, dx, dy) {
    if (o.t === 'stroke') {
      var p = o.p.slice(); for (var i = 0; i < p.length; i += 3) { p[i] = r1(p[i] + dx); p[i + 1] = r1(p[i + 1] + dy); }
      return Object.assign({}, o, { p: p, b: [o.b[0] + dx, o.b[1] + dy, o.b[2] + dx, o.b[3] + dy] });
    }
    if (o.t === 'conn') return o;
    return Object.assign({}, o, { x: r1(o.x + dx), y: r1(o.y + dy) });
  }
  /* Pixel eraser: remove the parts of a stroke that fall inside the eraser circle. Returns null if untouched, else the
     remaining pieces as new strokes (possibly none). Long segments are first split so a quick swipe can't skip over. */
  function cutStroke(o, px, py, r) {
    var rr = r + o.w / 2, b = o.b;
    if (px < b[0] - rr || px > b[2] + rr || py < b[1] - rr || py > b[3] + rr) return null;
    var p = o.p, n = p.length / 3, pts = [], i, step = Math.max(rr * 0.6, 1.5);
    for (i = 0; i < n; i++) {
      pts.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      if (i < n - 1) {
        var dx = p[i * 3 + 3] - p[i * 3], dy = p[i * 3 + 4] - p[i * 3 + 1], L = Math.hypot(dx, dy), k = Math.ceil(L / step);
        for (var j = 1; j < k; j++) { var f = j / k; pts.push(p[i * 3] + dx * f, p[i * 3 + 1] + dy * f, p[i * 3 + 2] + (p[i * 3 + 5] - p[i * 3 + 2]) * f); }
      }
    }
    var m = pts.length / 3, hit = false, runs = [], cur = [];
    for (i = 0; i < m; i++) {
      var inside = Math.hypot(pts[i * 3] - px, pts[i * 3 + 1] - py) <= rr;
      if (inside) { hit = true; if (cur.length) { runs.push(cur); cur = []; } }
      else cur.push(r1(pts[i * 3]), r1(pts[i * 3 + 1]), Math.round(pts[i * 3 + 2] * 100) / 100);
    }
    if (!hit) return null;
    if (cur.length) runs.push(cur);
    return runs.filter(function (run) { return run.length >= 6; }).map(function (run) { return Object.assign({}, o, { id: uid(), p: run, b: strokeBox(run, o.w) }); });
  }
  function strokeBox(p, w) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < p.length; i += 3) { x0 = Math.min(x0, p[i]); y0 = Math.min(y0, p[i + 1]); x1 = Math.max(x1, p[i]); y1 = Math.max(y1, p[i + 1]); }
    var m = w / 2 + 1; return [x0 - m, y0 - m, x1 + m, y1 + m];
  }

  /* ---------------- mind-map layout (pure) ---------------- */
  function nodeDims(o) {
    var g = mctx(), top = !o.par, fs = top ? 22 : 17;
    g.font = (top ? 700 : 500) + ' ' + fs + 'px ' + FONT;
    var lines = wrapText(g, o.tx || ' ', NODE_MAX), mw = 0;
    lines.forEach(function (l) { mw = Math.max(mw, g.measureText(l).width); });
    return { w: Math.ceil(Math.max(mw + 30, 72)), h: Math.ceil(lines.length * fs * 1.28 + 18), lines: lines, fs: fs };
  }
  function layoutMind(objs, dirMode, onlyRoot) {
    var by = new Map(objs.map(function (o) { return [o.id, o]; })), kids = new Map(), roots = [];
    objs.forEach(function (o) {
      if (o.t !== 'node') return;
      if (o.par && by.has(o.par)) { if (!kids.has(o.par)) kids.set(o.par, []); kids.get(o.par).push(o); } else roots.push(o);
    });
    var H = new Map(), out = new Map();
    function sub(o) {
      var d = nodeDims(o), ks = o.collapsed ? [] : (kids.get(o.id) || []), tot = 0;
      ks.forEach(function (k, i) { tot += sub(k) + (i ? VGAP : 0); });
      var h = Math.max(d.h, tot); H.set(o.id, h); return h;
    }
    function place(o, x, yTop, dir) {
      var d = nodeDims(o), h = H.get(o.id), px = dir > 0 ? x : x - d.w;
      out.set(o.id, { x: r1(px), y: r1(yTop + (h - d.h) / 2), w: d.w, h: d.h });
      var ks = o.collapsed ? [] : (kids.get(o.id) || []), tot = 0;
      ks.forEach(function (k, i) { tot += H.get(k.id) + (i ? VGAP : 0); });
      var y = yTop + (h - tot) / 2;
      ks.forEach(function (k) { place(k, dir > 0 ? px + d.w + HGAP : px - HGAP, y, dir); y += H.get(k.id) + VGAP; });
    }
    roots.forEach(function (r) {
      if (onlyRoot && r.id !== onlyRoot) return;
      var d = nodeDims(r), ks = r.collapsed ? [] : (kids.get(r.id) || []), cy = r.y + d.h / 2;
      out.set(r.id, { x: r.x, y: r.y, w: d.w, h: d.h });
      var right = dirMode === 'both' ? ks.filter(function (k, i) { return i % 2 === 0; }) : ks;
      var left = dirMode === 'both' ? ks.filter(function (k, i) { return i % 2 === 1; }) : [];
      [[right, 1], [left, -1]].forEach(function (side) {
        var arr = side[0], dir = side[1], tot = 0;
        arr.forEach(function (k, i) { tot += sub(k) + (i ? VGAP : 0); });
        var y = cy - tot / 2;
        arr.forEach(function (k) { place(k, dir > 0 ? r.x + d.w + HGAP : r.x - HGAP, y, dir); y += H.get(k.id) + VGAP; });
      });
    });
    return objs.map(function (o) {
      var p = out.get(o.id); if (!p) return o;
      return (p.x === o.x && p.y === o.y && p.w === o.w && p.h === o.h) ? o : Object.assign({}, o, p);
    });
  }
  function nodeRoot(objs, id) {
    var by = new Map(objs.map(function (o) { return [o.id, o]; })), cur = by.get(id), guard = 0;
    while (cur && cur.par && by.has(cur.par) && guard++ < 500) cur = by.get(cur.par);
    return cur ? cur.id : null;
  }
  function descendants(objs, id) {
    var ids = new Set([id]), grew = true;
    while (grew) { grew = false; objs.forEach(function (o) { if (o.t === 'node' && o.par && ids.has(o.par) && !ids.has(o.id)) { ids.add(o.id); grew = true; } }); }
    return ids;
  }
  function outlineOf(objs) {
    var by = new Map(objs.map(function (o) { return [o.id, o]; })), kids = new Map(), lines = [];
    objs.forEach(function (o) { if (o.t === 'node' && o.par && by.has(o.par)) { if (!kids.has(o.par)) kids.set(o.par, []); kids.get(o.par).push(o); } });
    function walk(o, d) { lines.push('  '.repeat(d) + String(o.tx || '').replace(/\n/g, ' ')); (kids.get(o.id) || []).forEach(function (k) { walk(k, d + 1); }); }
    objs.forEach(function (o) { if (o.t === 'node' && (!o.par || !by.has(o.par))) walk(o, 0); });
    return lines.join('\n');
  }
  function parseOutline(text, ox, oy) {
    var rows = [], stack = [], objs = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      if (!raw.trim()) return;
      var m = /^([ \t]*)/.exec(raw), ind = m[1].replace(/\t/g, '  ').length;
      var tx = raw.trim().replace(/^([-*•+]|\d+[.)])\s+/, '').trim();
      if (tx) rows.push({ ind: ind, tx: tx });
    });
    rows.forEach(function (r) {
      while (stack.length && stack[stack.length - 1].ind >= r.ind) stack.pop();
      var par = stack.length ? stack[stack.length - 1].id : null, o = { id: uid(), t: 'node', x: ox, y: oy, w: 80, h: 40, tx: r.tx, par: par };
      objs.push(o); stack.push({ id: o.id, ind: r.ind });
    });
    return objs;
  }

  /* ---------------- mount ---------------- */
  function mount(body, host) {
    var t = host.t, toast = host.toast || function () { };
    var kidMode = !!host.kidMode;
    function requireUnlock(cb) {
      if (!kidMode) { cb(); return; }
      if (!host.kidModeUnlock) { toast(t('dd_kid_locked')); return; }
      Promise.resolve(host.kidModeUnlock()).then(function (ok) { if (ok) cb(); }, function () { });
    }
    var widgetEl = body.closest ? body.closest('.widget') : null;
    if (widgetEl) widgetEl.classList.add('dd-widget');
    var alive = true;

    /* ----- preferences (small, so localStorage) ----- */
    var prefs = (function () { var p = null; try { p = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { } p = p && typeof p === 'object' ? p : {}; return Object.assign({ last: null, color: PALETTE[0], size: 1, hlColor: '#fdd835', hlSize: 3, fill: false, shape: 'rect', layout: 'both', eraseParts: true }, p); })();
    function savePrefs() { try { localStorage.setItem(LS_KEY, JSON.stringify(prefs)); } catch (e) { } }

    /* ----- state ----- */
    var board = null, boards = [], pi = 0, page = null;
    var hist = new Map();                         // page id -> { u:[], r:[] }
    var mode = 'draw', tool = 'pen', shapeKind = prefs.shape, sel = new Set();
    var view = { x: 0, y: 0, z: 1 };
    var drag = null, live = null, edit = null, spaceDown = false, focusMode = false, penSeen = 0;
    var pointers = new Map(), gesture = null, hoverId = null, cursorW = null;
    var saveTimer = null, saveWarned = false, rafId = 0, dirtyFrame = true, pop = null;

    /* ----- DOM ----- */
    body.innerHTML =
      '<div class="dd-root" tabindex="-1">' +
        '<div class="dd-top"></div>' +
        '<div class="dd-main"><div class="dd-rail" role="toolbar"></div>' +
          '<div class="dd-stage"><canvas class="dd-canvas"></canvas><textarea class="dd-edit" hidden spellcheck="false"></textarea><div class="dd-hint" hidden></div><button type="button" class="dd-unfocus" hidden></button></div></div>' +
        '<div class="dd-bottom"></div><div class="dd-pop" hidden></div><div class="dd-modal" hidden></div>' +
        '<input type="file" class="dd-file" accept=".json,.drawdeck,application/json" hidden><input type="file" class="dd-imgfile" accept="image/*" hidden>' +
      '</div>';
    var rootEl = body.querySelector('.dd-root'), topEl = rootEl.querySelector('.dd-top'), railEl = rootEl.querySelector('.dd-rail'),
      stageEl = rootEl.querySelector('.dd-stage'), cv = rootEl.querySelector('.dd-canvas'), taEl = rootEl.querySelector('.dd-edit'),
      hintEl = rootEl.querySelector('.dd-hint'), unfocusEl = rootEl.querySelector('.dd-unfocus'), botEl = rootEl.querySelector('.dd-bottom'),
      popEl = rootEl.querySelector('.dd-pop'), modalEl = rootEl.querySelector('.dd-modal'), fileEl = rootEl.querySelector('.dd-file'), imgFileEl = rootEl.querySelector('.dd-imgfile');
    var g = cv.getContext('2d'), W = 0, Hh = 0, dpr = 1;
    unfocusEl.textContent = '⤢'; unfocusEl.title = t('dd_unfocus'); unfocusEl.setAttribute('aria-label', t('dd_unfocus'));
    taEl.placeholder = t('dd_text_ph');

    /* ----- caches keyed by the (immutable) objs array ----- */
    var paintObjs = null;   // set while painting a page other than the open one (PDF export)
    var cacheArr = null, cacheBy = null, cacheHid = null;
    function prep() {
      if (cacheArr === page.objs) return;
      cacheArr = page.objs; cacheBy = new Map(); cacheHid = new Set();
      page.objs.forEach(function (o) { cacheBy.set(o.id, o); });
      page.objs.forEach(function (o) { if (o.t === 'node' && o.collapsed) descendants(page.objs, o.id).forEach(function (id) { if (id !== o.id) cacheHid.add(id); }); });
    }
    function byId() { prep(); return cacheBy; }
    function hidden() { prep(); return cacheHid; }
    var tcache = new WeakMap();
    function textFit(o) {          // wrapped lines + font size that fit a shape
      var c = tcache.get(o); if (c) return c;
      var gg = mctx(), fs = o.ts || 20, lines;
      for (; ;) {
        gg.font = '500 ' + fs + 'px ' + FONT; lines = wrapText(gg, o.tx || '', Math.max(20, o.w - 18));
        if (lines.length * fs * 1.25 <= o.h - 8 || fs <= 10) break; fs -= 1;
      }
      c = { lines: lines, fs: fs }; tcache.set(o, c); return c;
    }
    function freeTextSize(o) {
      var gg = mctx(); gg.font = '500 ' + o.ts + 'px ' + FONT;
      var lines = String(o.tx || '').split('\n'), mw = 0; lines.forEach(function (l) { mw = Math.max(mw, gg.measureText(l).width); });
      return { w: Math.ceil(Math.max(mw, 24)), h: Math.ceil(Math.max(1, lines.length) * o.ts * 1.25) };
    }
    function branchColor(o, by) {
      var cur = o, guard = 0;
      while (cur && guard++ < 500) { if (cur.col) return cur.col; if (!cur.par) break; cur = by.get(cur.par); }
      if (!o.par) return '#E8A33D';
      var top = o, g2 = 0; while (top.par && by.get(top.par) && by.get(top.par).par && g2++ < 500) top = by.get(top.par);
      var sibs = (paintObjs || page.objs).filter(function (x) { return x.t === 'node' && x.par === top.par; });
      return BRANCH[Math.max(0, sibs.indexOf(top)) % BRANCH.length];
    }

    /* ----- view transforms ----- */
    function toWorld(cx, cy) { return { x: (cx - view.x) / view.z, y: (cy - view.y) / view.z }; }
    function evPt(e) { var r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
    function worldOf(e) { var p = evPt(e), w = toWorld(p.sx, p.sy); w.sx = p.sx; w.sy = p.sy; return w; }
    function zoomAt(sx, sy, z2) {
      z2 = clamp(z2, 0.1, 4); var w = toWorld(sx, sy); view.z = z2; view.x = sx - w.x * z2; view.y = sy - w.y * z2; syncView();
    }
    function syncView() { page.view = { x: r1(view.x), y: r1(view.y), z: Math.round(view.z * 1000) / 1000 }; need(); renderChrome(); saveSoon(); }
    function contentBounds(objs) {
      var b = null; objs.forEach(function (o) { var bb = bboxOf(o); if (o.t === 'conn') return; b = b ? [Math.min(b[0], bb[0]), Math.min(b[1], bb[1]), Math.max(b[2], bb[2]), Math.max(b[3], bb[3])] : bb.slice(); });
      return b;
    }
    function fitView() {
      var b = contentBounds(page.objs);
      if (!b) { view = { x: W / 2, y: Hh / 2, z: 1 }; syncView(); return; }
      var bw = Math.max(40, b[2] - b[0]), bh = Math.max(40, b[3] - b[1]), z = clamp(Math.min((W - 120) / bw, (Hh - 120) / bh), 0.1, 2);
      view.z = z; view.x = (W - bw * z) / 2 - b[0] * z; view.y = (Hh - bh * z) / 2 - b[1] * z; syncView();
    }

    /* ----- history ----- */
    function H() { var h = hist.get(page.id); if (!h) { h = { u: [], r: [] }; hist.set(page.id, h); } return h; }
    function pushHist(prev) { var h = H(); h.u.push(prev); if (h.u.length > 80) h.u.shift(); h.r.length = 0; }
    function change(next) { if (next === page.objs) return; pushHist(page.objs); page.objs = next; need(); dirty(); renderChrome(); }
    function undo() { var h = H(); if (!h.u.length) return; endEdit(true); h.r.push(page.objs); page.objs = h.u.pop(); pruneSel(); need(); dirty(); renderChrome(); }
    function redo() { var h = H(); if (!h.r.length) return; endEdit(true); h.u.push(page.objs); page.objs = h.r.pop(); pruneSel(); need(); dirty(); renderChrome(); }
    function pruneSel() { var by = byId(); sel.forEach(function (id) { if (!by.has(id)) sel.delete(id); }); }
    function replaceObj(objs, id, patch) { return objs.map(function (o) { return o.id === id ? Object.assign({}, o, typeof patch === 'function' ? patch(o) : patch) : o; }); }

    /* ----- persistence ----- */
    function dirty() { saveSoon(); }
    function saveSoon() { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(persist, 600); }
    function persist() {
      saveTimer = null; if (!board) return;
      board.updated = Date.now(); prefs.last = board.id; savePrefs();
      try { var p = host.idb.put(STORE, board); if (p && p.catch) p.catch(failSave); } catch (e) { failSave(e); }
    }
    function failSave(e) { if (!saveWarned) { saveWarned = true; toast(t('dd_save_fail'), 6000); } console.warn('DrawDeck: save failed', e); }
    function newPage() { return { id: uid(), objs: [], view: { x: 0, y: 0, z: 1 } }; }
    function newBoard() {
      var n = boards.length + 1;
      return { id: uid(), name: t('dd_untitled', { n: n }), bg: 'white', mode: 'draw', layout: prefs.layout, pages: [newPage()], created: Date.now(), updated: Date.now() };
    }
    function openBoard(b) {
      endEdit(true); board = b; boards = boards.filter(function (x) { return x.id !== b.id; }); boards.unshift(b);
      mode = b.mode || 'draw'; gotoPage(Math.min(pi, b.pages.length - 1) || 0, true); prefs.last = b.id; savePrefs();
      defaultInkForBg(); renderChrome();
    }
    function gotoPage(i, first) {
      endEdit(true); pi = clamp(i, 0, board.pages.length - 1); page = board.pages[pi]; sel.clear(); cacheArr = null;
      view = Object.assign({ x: W / 2, y: Hh / 2, z: 1 }, page.view && page.view.z ? page.view : {});
      if (!page.view || !page.view.z) view = { x: W / 2, y: Hh / 2, z: 1 };
      need(); if (!first) renderChrome();
    }
    function defaultInkForBg() {
      var dark = board.bg === 'chalk';
      if (dark && prefs.color === '#1a1a1a') prefs.color = '#ffffff';
      else if (!dark && prefs.color === '#ffffff' && board.bg !== 'chalk') prefs.color = '#1a1a1a';
    }

    /* ----- drawing ----- */
    function need() { dirtyFrame = true; if (!rafId && alive) rafId = requestAnimationFrame(frame); }
    function frame() { rafId = 0; if (!alive || !dirtyFrame) return; dirtyFrame = false; paintStage(); if (dirtyFrame) need(); }
    function resize() {
      var r = stageEl.getBoundingClientRect(); dpr = window.devicePixelRatio || 1;
      var nw = Math.max(1, Math.floor(r.width)), nh = Math.max(1, Math.floor(r.height));
      if (nw === W && nh === Hh) return;
      var first = !W; W = nw; Hh = nh; cv.width = Math.floor(W * dpr); cv.height = Math.floor(Hh * dpr);
      if (first && page && !(page.view && page.view.z)) { view.x = W / 2; view.y = Hh / 2; }
      need();
    }

    function drawBg(c, w, h, v, bg) {
      c.fillStyle = bg === 'chalk' ? '#22332c' : '#ffffff'; c.fillRect(0, 0, w, h);
      function lines(step, color, lw) {
        var s = step * v.z; if (s < 7) return; c.strokeStyle = color; c.lineWidth = lw; c.beginPath();
        var ox = ((v.x % s) + s) % s, oy = ((v.y % s) + s) % s;
        for (var x = ox; x < w; x += s) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, h); }
        for (var y = oy; y < h; y += s) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); }
        c.stroke();
      }
      if (bg === 'grid') lines(40, '#dfe4ec', 1);
      else if (bg === 'graph') { lines(20, '#e8edf4', 1); lines(100, '#c5d0e2', 1); }
      else if (bg === 'lined') {
        var s = 40 * v.z; if (s >= 8) { c.strokeStyle = '#cfdcf0'; c.lineWidth = 1; c.beginPath(); for (var y = ((v.y % s) + s) % s; y < h; y += s) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); } c.stroke(); }
        c.strokeStyle = 'rgba(229,57,53,.55)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(Math.round(v.x) + 0.5, 0); c.lineTo(Math.round(v.x) + 0.5, h); c.stroke();
      } else if (bg === 'writing') {
        var P = 160 * v.z;      // three-line handwriting paper: top line, dashed middle line, baseline
        if (P >= 40) for (var wy = ((v.y % P) + P) % P - P; wy < h + P; wy += P) {
          c.lineWidth = 1; c.strokeStyle = '#a9c0e4'; c.beginPath(); c.moveTo(0, Math.round(wy) + 0.5); c.lineTo(w, Math.round(wy) + 0.5); c.stroke();
          c.setLineDash([9, 7]); c.strokeStyle = '#e4a3a3'; c.beginPath(); c.moveTo(0, Math.round(wy + 40 * v.z) + 0.5); c.lineTo(w, Math.round(wy + 40 * v.z) + 0.5); c.stroke(); c.setLineDash([]);
          c.lineWidth = 1.6; c.strokeStyle = '#5f86c9'; c.beginPath(); c.moveTo(0, Math.round(wy + 80 * v.z) + 0.5); c.lineTo(w, Math.round(wy + 80 * v.z) + 0.5); c.stroke();
        }
      } else if (bg === 'dots') {
        var ds = 40 * v.z; if (ds >= 9) { c.fillStyle = '#b9c2d3'; for (var yy = ((v.y % ds) + ds) % ds; yy < h; yy += ds) for (var xx = ((v.x % ds) + ds) % ds; xx < w; xx += ds) { c.beginPath(); c.arc(xx, yy, 1.3, 0, 6.2832); c.fill(); } }
      } else if (bg === 'axes') {
        lines(40, '#e6ebf3', 1);
        c.strokeStyle = '#1a1a1a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(0, Math.round(v.y) + 0.5); c.lineTo(w, Math.round(v.y) + 0.5); c.moveTo(Math.round(v.x) + 0.5, 0); c.lineTo(Math.round(v.x) + 0.5, h); c.stroke();
        var unit = 40 * v.z, k = 1, steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; for (var si = 0; si < steps.length; si++) { k = steps[si]; if (k * unit >= 46) break; }
        c.fillStyle = '#4a5568'; c.font = '11px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'top';
        var n0 = Math.ceil((0 - v.x) / (k * unit)), n1 = Math.floor((w - v.x) / (k * unit));
        for (var n = n0; n <= n1; n++) { if (!n) continue; var px = v.x + n * k * unit; c.fillText(String(n * k), px, v.y + 5); c.fillRect(Math.round(px), v.y - 3, 1, 6); }
        c.textAlign = 'right'; c.textBaseline = 'middle';
        var m0 = Math.ceil((0 - v.y) / (k * unit)), m1 = Math.floor((h - v.y) / (k * unit));
        for (var m = m0; m <= m1; m++) { if (!m) continue; var py = v.y + m * k * unit; c.fillText(String(-m * k), v.x - 6, py); c.fillRect(v.x - 3, Math.round(py), 6, 1); }
        c.fillText('0', v.x - 6, v.y + 9);
      }
    }
    function strokePath(c, p) {
      var n = p.length / 3; c.beginPath(); c.moveTo(p[0], p[1]);
      if (n === 1) { c.lineTo(p[0] + 0.01, p[1]); return; }
      for (var i = 1; i < n - 1; i++) { var x = p[i * 3], y = p[i * 3 + 1], nx = p[i * 3 + 3], ny = p[i * 3 + 4]; c.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2); }
      c.lineTo(p[(n - 1) * 3], p[(n - 1) * 3 + 1]);
    }
    function drawStroke(c, o) {
      c.save(); c.strokeStyle = o.c; c.lineJoin = 'round'; c.lineCap = o.hl ? 'butt' : 'round'; if (o.hl) c.globalAlpha = 0.4;
      if (o.pr && o.p.length > 6) {                // pen pressure: width varies along the stroke
        var p = o.p, n = p.length / 3;
        for (var i = 1; i < n; i++) {
          var x0 = i > 1 ? (p[i * 3 - 3] + p[i * 3]) / 2 : p[0], y0 = i > 1 ? (p[i * 3 - 2] + p[i * 3 + 1]) / 2 : p[1];
          var x1 = i < n - 1 ? (p[i * 3] + p[i * 3 + 3]) / 2 : p[i * 3], y1 = i < n - 1 ? (p[i * 3 + 1] + p[i * 3 + 4]) / 2 : p[i * 3 + 1];
          c.lineWidth = o.w * (0.35 + 0.95 * clamp(p[i * 3 + 2], 0, 1)); c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(p[i * 3 - 3 + 3], p[i * 3 - 2 + 3], x1, y1); c.stroke();
        }
      } else { c.lineWidth = o.w; strokePath(c, o.p); c.stroke(); }
      c.restore();
    }
    function shapePath(c, o) {
      var x = o.x, y = o.y, w = o.w, h = o.h; c.beginPath();
      if (o.k === 'ellipse') c.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, 6.2832);
      else if (o.k === 'diamond') { c.moveTo(x + w / 2, y); c.lineTo(x + w, y + h / 2); c.lineTo(x + w / 2, y + h); c.lineTo(x, y + h / 2); c.closePath(); }
      else if (o.k === 'pill') c.roundRect(x, y, w, h, Math.min(w, h) / 2);
      else if (o.k === 'round') c.roundRect(x, y, w, h, Math.min(14, h / 2));
      else c.rect(x, y, w, h);
    }
    function arrowHead(c, x1, y1, x2, y2, size) {
      var a = Math.atan2(y2 - y1, x2 - x1); c.beginPath(); c.moveTo(x2, y2);
      c.lineTo(x2 - size * Math.cos(a - 0.45), y2 - size * Math.sin(a - 0.45)); c.moveTo(x2, y2); c.lineTo(x2 - size * Math.cos(a + 0.45), y2 - size * Math.sin(a + 0.45)); c.stroke();
    }
    function drawText(c, lines, fs, color, cx, cy, align, lh) {
      c.fillStyle = color; c.textAlign = align; c.textBaseline = 'middle'; c.font = '500 ' + fs + 'px ' + FONT;
      var total = lines.length * fs * lh, y = cy - total / 2 + fs * lh / 2;
      lines.forEach(function (l) { c.fillText(l, cx, y); y += fs * lh; });
    }
    function drawShape(c, o, ink) {
      c.save(); c.lineWidth = o.sw || 3; c.strokeStyle = o.c; c.lineJoin = 'round'; c.lineCap = 'round';
      if (isLine(o)) { c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(o.x + o.w, o.y + o.h); c.stroke(); if (o.k === 'arrow') arrowHead(c, o.x, o.y, o.x + o.w, o.y + o.h, 12 + (o.sw || 3) * 2); c.restore(); return; }
      shapePath(c, o);
      if (o.f) { c.fillStyle = o.f; c.fill(); }
      c.stroke();
      if (o.tx) { var tf = textFit(o); drawText(c, tf.lines, tf.fs, o.k === 'note' ? '#1a1a1a' : (o.f && lum(o.f.slice(0, 7)) > 0.7 && o.f.length === 7 ? '#1a1a1a' : ink), o.x + o.w / 2, o.y + o.h / 2, 'center', 1.25); }
      c.restore();
    }
    function drawNode(c, o, by, ink) {
      var d = nodeDims(o), col = branchColor(o, by), top = !o.par, depth1 = o.par && by.get(o.par) && !by.get(o.par).par;
      c.save(); c.lineWidth = 2.5;
      c.beginPath(); c.roundRect(o.x, o.y, o.w, o.h, Math.min(16, o.h / 2));
      var textCol;
      if (top || depth1) { c.fillStyle = col; c.fill(); textCol = inkOn(col); }
      else { c.fillStyle = board.bg === 'chalk' ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.035)'; c.fill(); c.strokeStyle = col; c.stroke(); textCol = ink; }
      drawText(c, d.lines, d.fs, textCol, o.x + o.w / 2, o.y + o.h / 2, 'center', 1.28);
      c.restore();
    }
    function drawMindEdge(c, o, by) {
      var p = by.get(o.par); if (!p) return;
      var right = o.x + o.w / 2 >= p.x + p.w / 2, x1 = right ? p.x + p.w : p.x, y1 = p.y + p.h / 2, x2 = right ? o.x : o.x + o.w, y2 = o.y + o.h / 2, dx = (x2 - x1) * 0.5;
      c.save(); c.strokeStyle = branchColor(o, by); c.lineWidth = p.par ? 2.5 : 4; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x1, y1); c.bezierCurveTo(x1 + dx, y1, x2 - dx, y2, x2, y2); c.stroke(); c.restore();
    }
    function drawBadge(c, o, by) {
      var kids = (paintObjs || page.objs).filter(function (x) { return x.t === 'node' && x.par === o.id; }).length; if (!kids) return;
      var p = by.get(o.par), right = !p || o.x + o.w / 2 >= p.x + p.w / 2, bx = right ? o.x + o.w + 11 : o.x - 11, by2 = o.y + o.h / 2;
      c.save(); c.fillStyle = '#ffffff'; c.strokeStyle = branchColor(o, by); c.lineWidth = 2; c.beginPath(); c.arc(bx, by2, 8, 0, 6.2832); c.fill(); c.stroke();
      c.fillStyle = '#1a1a1a'; c.font = '700 10px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.collapsed ? String(descendants(paintObjs || page.objs, o.id).size - 1) : '–', bx, by2 + 0.5); c.restore();
    }
    function connEnds(o, by) {
      var a = by.get(o.a), b = by.get(o.b); if (!a || !b || a.w == null || b.w == null) return null;
      var bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
      return { p1: edgePoint(a, bc.x, bc.y), p2: edgePoint(b, ac.x, ac.y) };
    }
    function drawConn(c, o, by, bgName) {
      var e = connEnds(o, by); if (!e) return;
      c.save(); c.strokeStyle = o.c; c.lineWidth = o.sw || 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(e.p1.x, e.p1.y); c.lineTo(e.p2.x, e.p2.y); c.stroke();
      arrowHead(c, e.p1.x, e.p1.y, e.p2.x, e.p2.y, 12 + (o.sw || 3) * 2);
      if (o.tx) {
        var mx = (e.p1.x + e.p2.x) / 2, my = (e.p1.y + e.p2.y) / 2; c.font = '600 15px ' + FONT; var tw = c.measureText(o.tx).width + 12;
        c.fillStyle = bgName === 'chalk' ? '#22332c' : '#ffffff'; c.beginPath(); c.roundRect(mx - tw / 2, my - 11, tw, 22, 8); c.fill();
        c.fillStyle = o.c; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.tx, mx, my + 0.5);
      }
      c.restore();
    }
    var imgCache = new Map();
    function getImg(src) {
      var e = imgCache.get(src); if (e) return e;
      e = { img: new Image(), ok: false }; imgCache.set(src, e);
      e.img.onload = function () { e.ok = true; need(); }; e.img.onerror = function () { e.err = true; need(); }; e.img.src = src; return e;
    }
    function ensureImages(objs) {
      return Promise.all(objs.filter(function (o) { return o.t === 'image'; }).map(function (o) {
        var e = getImg(o.src); if (e.ok || e.err) return null;
        return new Promise(function (res) { e.img.addEventListener('load', res); e.img.addEventListener('error', res); });
      }));
    }
    function drawObj(c, o, by, ink) {
      if (MATH[o.t]) { drawMath(c, o, ink); return; }
      if (o.t === 'image') { var ie = getImg(o.src); if (ie.ok) c.drawImage(ie.img, o.x, o.y, o.w, o.h); else { c.save(); c.fillStyle = 'rgba(128,128,128,.25)'; c.fillRect(o.x, o.y, o.w, o.h); c.restore(); } return; }
      if (o.t === 'stroke') drawStroke(c, o);
      else if (o.t === 'shape') drawShape(c, o, ink);
      else if (o.t === 'text') { c.save(); c.fillStyle = o.c; c.font = '500 ' + o.ts + 'px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'top'; var y = o.y; String(o.tx).split('\n').forEach(function (l) { c.fillText(l, o.x, y + o.ts * 0.12); y += o.ts * 1.25; }); c.restore(); }
      else if (o.t === 'node') { drawNode(c, o, by, ink); drawBadge(c, o, by); }
    }
    function paint(c, w, h, v, objs, bgName, opts) {
      opts = opts || {}; paintObjs = objs;
      var by = new Map(objs.map(function (o) { return [o.id, o]; })), hid = new Set();
      objs.forEach(function (o) { if (o.t === 'node' && o.collapsed) descendants(objs, o.id).forEach(function (id) { if (id !== o.id) hid.add(id); }); });
      var ink = bgName === 'chalk' ? '#ffffff' : '#1a1a1a';
      drawBg(c, w, h, v, bgName);
      c.save(); c.translate(v.x, v.y); c.scale(v.z, v.z);
      objs.forEach(function (o) { if (o.t === 'node' && o.par && !hid.has(o.id) && by.has(o.par)) drawMindEdge(c, o, by); });
      objs.forEach(function (o) { if (o.t === 'conn') drawConn(c, o, by, bgName); });
      objs.forEach(function (o) { if (o.t === 'conn' || hid.has(o.id)) return; if (opts.skipId && opts.skipId === o.id) { if (o.t === 'text') return; o = Object.assign({}, o, { tx: '' }); } drawObj(c, o, by, ink); });
      if (!opts.exporting) {
        if (live) { if (live.t === 'stroke') drawStroke(c, live); else if (live.t === 'shape') drawShape(c, live, ink); }
        if (drag && drag.kind === 'conn' && drag.cur) { var a = by.get(drag.from); if (a) { var ep = edgePoint(a, drag.cur.x, drag.cur.y); c.save(); c.strokeStyle = prefs.color; c.lineWidth = 3; c.setLineDash([8, 6]); c.beginPath(); c.moveTo(ep.x, ep.y); c.lineTo(drag.cur.x, drag.cur.y); c.stroke(); c.restore(); } }
        if (hoverId && drag && drag.kind === 'conn') { var hs = by.get(hoverId); if (hs && hs.w != null) { c.save(); c.strokeStyle = '#47C9B6'; c.lineWidth = 3 / v.z; shapePath(c, hs.t === 'node' ? Object.assign({}, hs, { k: 'round' }) : hs); c.stroke(); c.restore(); } }
        c.save(); c.strokeStyle = '#E8A33D'; c.fillStyle = '#E8A33D'; c.lineWidth = 1.5 / v.z; c.setLineDash([6 / v.z, 4 / v.z]);
        sel.forEach(function (id) {
          var o = by.get(id); if (!o || hid.has(id)) return;
          if (o.t === 'conn') { var e = connEnds(o, by); if (e) { c.beginPath(); c.moveTo(e.p1.x, e.p1.y); c.lineTo(e.p2.x, e.p2.y); c.stroke(); } return; }
          var m = 5 / v.z;
          if (o.a) { c.save(); c.translate(o.x + o.w / 2, o.y + o.h / 2); c.rotate(o.a); c.strokeRect(-o.w / 2 - m, -o.h / 2 - m, o.w + 2 * m, o.h + 2 * m); c.restore(); }
          else { var b = bboxOf(o); c.strokeRect(b[0] - m, b[1] - m, b[2] - b[0] + 2 * m, b[3] - b[1] + 2 * m); }
        });
        c.setLineDash([]);
        if (sel.size === 1) {
          var so = by.get(Array.from(sel)[0]);
          if (so && resizable(so)) { var hz = 10 / v.z, hp = worldPt(so, so.w + 5 / v.z, so.h + 5 / v.z); c.fillRect(hp.x - hz / 2, hp.y - hz / 2, hz, hz); }
          if (so && ROT[so.t]) { var tp = worldPt(so, so.w / 2, -5 / v.z), rh = worldPt(so, so.w / 2, -26 / v.z); c.beginPath(); c.moveTo(tp.x, tp.y); c.lineTo(rh.x, rh.y); c.stroke(); c.beginPath(); c.arc(rh.x, rh.y, 7 / v.z, 0, 6.2832); c.fill(); }
        }
        c.restore();
        if (drag && drag.kind === 'marquee' && drag.rect) { c.save(); c.strokeStyle = '#47C9B6'; c.fillStyle = 'rgba(71,201,182,.12)'; c.lineWidth = 1 / v.z; var r = drag.rect; c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); c.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]); c.restore(); }
        if (tool === 'eraser' && cursorW) { c.save(); c.strokeStyle = ink; c.lineWidth = 1.5 / v.z; c.beginPath(); c.arc(cursorW.x, cursorW.y, eraseR(), 0, 6.2832); c.stroke(); c.restore(); }
      }
      c.restore(); paintObjs = null;
    }
    function paintStage() {
      if (!page) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Hh);
      paint(g, W, Hh, view, page.objs, board.bg, { skipId: edit ? edit.id : null });
      hintEl.hidden = !!page.objs.length || !!live || !!edit;
      if (!hintEl.hidden) hintEl.textContent = t('dd_hint_' + mode);
      placeEditor();
    }

    /* ----- hit testing ----- */
    function hitObj(o, x, y, tol) {
      if (o.t === 'stroke') {
        var b = o.b; if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) return false;
        var p = o.p, r = Math.max(o.w / 2, 0) + tol;
        if (p.length === 3) return Math.hypot(x - p[0], y - p[1]) <= r;
        for (var i = 0; i < p.length - 3; i += 3) if (distSeg(x, y, p[i], p[i + 1], p[i + 3], p[i + 4]) <= r) return true;
        return false;
      }
      if (o.t === 'conn') { var e = connEnds(o, byId()); return !!e && distSeg(x, y, e.p1.x, e.p1.y, e.p2.x, e.p2.y) <= tol + 4; }
      if (MATH[o.t]) { var lp = localPt(o, x, y); return lp[0] >= -tol && lp[0] <= o.w + tol && lp[1] >= -tol && lp[1] <= o.h + tol; }
      if (isLine(o)) return distSeg(x, y, o.x, o.y, o.x + o.w, o.y + o.h) <= tol + (o.sw || 3) / 2;
      var bb = bboxOf(o); return x >= bb[0] - tol && x <= bb[2] + tol && y >= bb[1] - tol && y <= bb[3] + tol;
    }
    function topAt(x, y, filter) {
      var objs = page.objs, hid = hidden(), tol = 6 / view.z;
      for (var i = objs.length - 1; i >= 0; i--) { var o = objs[i]; if (hid.has(o.id) || (filter && !filter(o))) continue; if (hitObj(o, x, y, tol)) return o; }
      return null;
    }
    function badgeAt(x, y) {
      var by = byId(), hid = hidden(), found = null, tol = 12 / view.z;
      page.objs.forEach(function (o) {
        if (o.t !== 'node' || hid.has(o.id) || !page.objs.some(function (k) { return k.par === o.id; })) return;
        var p = by.get(o.par), right = !p || o.x + o.w / 2 >= p.x + p.w / 2, bx = right ? o.x + o.w + 11 : o.x - 11, bY = o.y + o.h / 2;
        if (Math.hypot(x - bx, y - bY) <= tol) found = o;
      });
      return found;
    }
    function eraseR() { return Math.max(8, SIZES[prefs.size] * 1.5) / view.z; }

    /* ----- editing text on the canvas (a real textarea, so IME input such as Vietnamese works) ----- */
    function startEdit(id, isNew) {
      endEdit(true); var o = byId().get(id); if (!o || o.t === 'image' || MATH[o.t]) return;
      edit = { id: id, isNew: !!isNew, orig: o.tx || '' };
      sel = new Set([id]); taEl.value = o.tx || ''; taEl.hidden = false; need(); placeEditor();
      function focusIt() { if (!edit || edit.id !== id) return; taEl.focus({ preventScroll: true }); if (isNew) taEl.select(); else taEl.setSelectionRange(taEl.value.length, taEl.value.length); }
      focusIt(); setTimeout(function () { if (edit && edit.id === id && document.activeElement !== taEl) focusIt(); }, 30);
      renderChrome();
    }
    function placeEditor() {
      if (!edit) { if (!taEl.hidden) taEl.hidden = true; return; }
      var o = byId().get(edit.id); if (!o) { taEl.hidden = true; return; }
      var x, y, w, h, fs, align = 'center', col;
      if (o.t === 'text') { fs = o.ts; x = o.x; y = o.y; w = Math.max(o.w || 0, 180) + 24; h = Math.max(o.h || 0, fs * 1.25) + 8; align = 'left'; col = o.c; }
      else if (o.t === 'node') { var d = nodeDims(o); fs = d.fs; x = o.x; y = o.y; w = Math.max(o.w, 150); h = Math.max(o.h, 40); col = (!o.par || (byId().get(o.par) && !byId().get(o.par).par)) ? inkOn(branchColor(o, byId())) : (board.bg === 'chalk' ? '#fff' : '#1a1a1a'); }
      else if (o.t === 'conn') { var e = connEnds(o, byId()); if (!e) return; fs = 15; w = 120; h = 30; x = (e.p1.x + e.p2.x) / 2 - w / 2; y = (e.p1.y + e.p2.y) / 2 - h / 2; col = o.c; }
      else { fs = textFit(o).fs; x = o.x; y = o.y; w = o.w; h = o.h; col = o.k === 'note' ? '#1a1a1a' : (board.bg === 'chalk' ? '#fff' : '#1a1a1a'); }
      var z = view.z, sx = x * z + view.x, sy = y * z + view.y;
      taEl.style.cssText = 'left:' + (sx - (o.t === 'node' && w > o.w ? (w - o.w) / 2 * z : 0)) + 'px;top:' + sy + 'px;width:' + w * z + 'px;min-height:' + h * z + 'px;font-size:' + fs * z + 'px;text-align:' + align + ';color:' + col + ';line-height:1.25;';
      taEl.hidden = false; taEl.style.height = 'auto'; taEl.style.height = Math.max(h * z, taEl.scrollHeight) + 'px';
    }
    function endEdit(commit) {
      if (!edit) return; var ed = edit; edit = null; var val = taEl.value.replace(/\s+$/, ''); taEl.hidden = true;
      var o = byId().get(ed.id); if (!o) { need(); return; }
      if (!commit) { if (ed.isNew && (o.t === 'text' || o.t === 'node') ) { pushHist(page.objs); page.objs = removeIds(page.objs, new Set([o.id])); dirty(); } need(); renderChrome(); return; }
      if ((o.t === 'text' || o.t === 'node') && !val.trim()) { if (ed.isNew || o.t === 'text') { var next = removeIds(page.objs, new Set([o.id])); if (o.t === 'node') next = relayoutFor(next, o.par); sel.delete(o.id); change(next); } need(); renderChrome(); return; }
      if (val === (o.tx || '')) { need(); renderChrome(); return; }
      var next2;
      if (o.t === 'text') { var up = Object.assign({}, o, { tx: val }); var sz = freeTextSize(up); next2 = replaceObj(page.objs, o.id, { tx: val, w: sz.w, h: sz.h }); }
      else if (o.t === 'node') { next2 = replaceObj(page.objs, o.id, { tx: val }); next2 = relayoutFor(next2, o.id); }
      else next2 = replaceObj(page.objs, o.id, { tx: val });
      if (ed.isNew) { /* the creation was already one undo step; fold the text into it */ page.objs = next2; need(); dirty(); renderChrome(); }
      else change(next2);
    }
    function relayoutFor(objs, anyId) {
      if (!anyId) return objs; var r = nodeRoot(objs, anyId); return r ? layoutMind(objs, board.layout || 'both', r) : objs;
    }
    taEl.addEventListener('keydown', function (e) {
      e.stopPropagation();
      if (e.isComposing) return;
      var o = edit && byId().get(edit.id);
      if (e.key === 'Escape') { e.preventDefault(); endEdit(true); rootEl.focus(); }   // Esc finishes (keeps what was typed); Undo reverts
      else if (e.key === 'Enter' && (!e.shiftKey) && (o && o.t !== 'text' || e.ctrlKey || e.metaKey)) { e.preventDefault(); endEdit(true); rootEl.focus(); if (o && o.t === 'node' && !e.ctrlKey) { sel = new Set([o.id]); addSibling(); } }
      else if (e.key === 'Tab' && o && o.t === 'node') { e.preventDefault(); var id = o.id; endEdit(true); sel = new Set([id]); addChild(); }
    });
    taEl.addEventListener('input', function () { need(); });
    taEl.addEventListener('blur', function () { if (edit) endEdit(true); });

    /* ----- object operations ----- */
    function removeIds(objs, ids) {
      var all = new Set(ids); ids.forEach(function (id) { var o = objs.find(function (x) { return x.id === id; }); if (o && o.t === 'node') descendants(objs, id).forEach(function (d) { all.add(d); }); });
      return objs.filter(function (o) { return !all.has(o.id) && !(o.t === 'conn' && (all.has(o.a) || all.has(o.b))); });
    }
    function deleteSel() {
      if (!sel.size) return; var parents = []; sel.forEach(function (id) { var o = byId().get(id); if (o && o.t === 'node' && o.par) parents.push(o.par); });
      var next = removeIds(page.objs, sel); parents.forEach(function (p) { next = relayoutFor(next, p); }); sel.clear(); change(next);
    }
    function dupSel() {
      if (!sel.size) return; var ids = new Set(sel); sel.forEach(function (id) { var o = byId().get(id); if (o && o.t === 'node') descendants(page.objs, id).forEach(function (d) { ids.add(d); }); });
      var map = new Map(), add = [];
      page.objs.forEach(function (o) { if (ids.has(o.id) && o.t !== 'conn') map.set(o.id, uid()); });
      page.objs.forEach(function (o) {
        if (!ids.has(o.id)) return;
        if (o.t === 'conn') { if (map.has(o.a) && map.has(o.b)) add.push(Object.assign({}, o, { id: uid(), a: map.get(o.a), b: map.get(o.b) })); return; }
        var n = translate(o, 28, 28); n = Object.assign({}, n, { id: map.get(o.id) });
        if (o.t === 'node') n.par = map.has(o.par) ? map.get(o.par) : null;
        add.push(n);
      });
      sel = new Set(add.filter(function (o) { return o.t !== 'conn'; }).map(function (o) { return o.id; })); change(page.objs.concat(add));
    }
    function addRoot(x, y) {
      var o = { id: uid(), t: 'node', x: r1(x), y: r1(y), w: 100, h: 44, tx: '', par: null };
      var d = nodeDims(Object.assign({}, o, { tx: t('dd_topic') })); o.w = d.w; o.h = d.h; o.x = r1(x - d.w / 2); o.y = r1(y - d.h / 2);
      pushHist(page.objs); page.objs = page.objs.concat([o]); sel = new Set([o.id]); need(); dirty(); startEdit(o.id, true);
    }
    function addChild() {
      var by = byId(), p = null; sel.forEach(function (id) { var o = by.get(id); if (o && o.t === 'node') p = o; });
      if (!p) { var c = toWorld(W / 2, Hh / 2); addRoot(c.x, c.y); return; }
      var n = { id: uid(), t: 'node', x: p.x + p.w + HGAP, y: p.y, w: 80, h: 40, tx: '', par: p.id };
      var d = nodeDims(Object.assign({}, n, { tx: ' ' })); n.w = d.w; n.h = d.h;
      var next = page.objs.map(function (o) { return o.id === p.id && o.collapsed ? Object.assign({}, o, { collapsed: false }) : o; }).concat([n]);
      pushHist(page.objs); page.objs = relayoutFor(next, p.id); sel = new Set([n.id]); need(); dirty(); startEdit(n.id, true);
    }
    function addSibling() {
      var by = byId(), cur = null; sel.forEach(function (id) { var o = by.get(id); if (o && o.t === 'node') cur = o; });
      if (!cur) { addChild(); return; } if (!cur.par) { addChild(); return; }
      var n = { id: uid(), t: 'node', x: cur.x, y: cur.y + cur.h + VGAP, w: 80, h: 40, tx: '', par: cur.par };
      var d = nodeDims(Object.assign({}, n, { tx: ' ' })); n.w = d.w; n.h = d.h;
      var idx = page.objs.indexOf(cur), next = page.objs.slice(); var last = idx; descendants(page.objs, cur.id).forEach(function (id) { last = Math.max(last, page.objs.findIndex(function (o) { return o.id === id; })); });
      next.splice(last + 1, 0, n);
      pushHist(page.objs); page.objs = relayoutFor(next, cur.par); sel = new Set([n.id]); need(); dirty(); startEdit(n.id, true);
    }
    function toggleCollapse() {
      var by = byId(), ids = []; sel.forEach(function (id) { var o = by.get(id); if (o && o.t === 'node' && page.objs.some(function (k) { return k.par === id; })) ids.push(id); });
      if (!ids.length) return; var next = page.objs; ids.forEach(function (id) { next = replaceObj(next, id, function (o) { return { collapsed: !o.collapsed }; }); });
      ids.forEach(function (id) { next = relayoutFor(next, id); }); change(next);
    }
    function tidy() {
      var rootId = null, by = byId(); sel.forEach(function (id) { var o = by.get(id); if (o && o.t === 'node') rootId = nodeRoot(page.objs, id); });
      change(layoutMind(page.objs, board.layout || 'both', rootId));
    }
    function applyColor(c, which) {
      if (which === 'hl' || tool === 'hl') prefs.hlColor = c; else prefs.color = c; savePrefs();
      if (sel.size) {
        var next = page.objs;
        sel.forEach(function (id) {
          var o = byId().get(id); if (!o) return;
          if (o.t === 'node') next = replaceObj(next, id, { col: c });
          else if (o.t === 'shape') next = replaceObj(next, id, { c: c, f: o.f ? tint(c, o.k === 'note' ? 'cc' : '33') : o.f });
          else next = replaceObj(next, id, { c: c });
        });
        change(next);
      }
      renderChrome(); need();
    }
    function applySize(i) {
      if (tool === 'hl') prefs.hlSize = i; else prefs.size = i; savePrefs();
      if (sel.size) {
        var next = page.objs;
        sel.forEach(function (id) { var o = byId().get(id); if (!o) return; if (o.t === 'stroke') { var nw = o.hl ? SIZES[i] * 2 : SIZES[i]; next = replaceObj(next, id, { w: nw, b: strokeBox(o.p, nw) }); } else if (o.t === 'shape' || o.t === 'conn') next = replaceObj(next, id, { sw: Math.max(2, SIZES[i]) }); else if (o.t === 'text') { var up = Object.assign({}, o, { ts: TEXT_SIZES[i] }); var sz = freeTextSize(up); next = replaceObj(next, id, { ts: TEXT_SIZES[i], w: sz.w, h: sz.h }); } });
        change(next);
      }
      renderChrome(); need();
    }
    function curColor() { return tool === 'hl' ? prefs.hlColor : prefs.color; }
    function curSize() { return tool === 'hl' ? prefs.hlSize : prefs.size; }

    /* ----- pointer input ----- */
    function startGesture() {
      var ps = Array.from(pointers.values()); if (ps.length < 2) return;
      live = null; if (drag && drag.kind !== 'pan') { page.objs = drag.before || page.objs; } drag = null;
      gesture = { d: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), cx: (ps[0].x + ps[1].x) / 2, cy: (ps[0].y + ps[1].y) / 2 }; need();
    }
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'pen') penSeen = Date.now();
      var rc = cv.getBoundingClientRect(); pointers.set(e.pointerId, { x: e.clientX - rc.left, y: e.clientY - rc.top, type: e.pointerType });
      try { cv.setPointerCapture(e.pointerId); } catch (er) { }
      closePop(); rootEl.focus({ preventScroll: true });
      if (edit) endEdit(true);
      if (e.pointerType === 'touch') {
        if (pointers.size >= 2) { startGesture(); return; }
        if (Date.now() - penSeen < 1500) return;                       // palm rejection: ignore a hand resting while the pen is in use
      }
      if (gesture) return;
      var p = worldOf(e);
      if (e.button === 1 || spaceDown || tool === 'hand') { drag = { kind: 'pan', sx: p.sx, sy: p.sy, vx: view.x, vy: view.y }; cv.style.cursor = 'grabbing'; return; }
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (tool === 'pen' || tool === 'hl') {
        var sz = tool === 'hl' ? SIZES[prefs.hlSize] * 2 : SIZES[prefs.size], pr = e.pointerType === 'pen';
        live = { id: uid(), t: 'stroke', c: curColor(), w: sz, hl: tool === 'hl', pr: pr && tool === 'pen', p: [r1(p.x), r1(p.y), pr ? e.pressure || 0.5 : 0.5] };
        var sn0 = rulerEdgeAt(p.x, p.y); drag = { kind: 'ink', snap: sn0 }; if (sn0) live.p = [r1(sn0.x0), r1(sn0.y0), 0.5]; need(); return;
      }
      if (tool === 'eraser' || (e.pointerType === 'pen' && (e.buttons & 32))) { drag = { kind: 'erase', before: page.objs }; eraseAt(p); return; }
      if (tool === 'text') {
        var th = topAt(p.x, p.y, function (o) { return o.t === 'text' || o.t === 'shape' && !isLine(o) || o.t === 'node' || o.t === 'conn'; });
        if (th) { startEdit(th.id, false); return; }
        var ts = TEXT_SIZES[prefs.size], o = { id: uid(), t: 'text', x: r1(p.x), y: r1(p.y - ts / 2), tx: '', ts: ts, c: prefs.color, w: 24, h: ts * 1.25 };
        pushHist(page.objs); page.objs = page.objs.concat([o]); need(); startEdit(o.id, true); return;
      }
      if (tool === 'shape') { drag = { kind: 'shape', x0: p.x, y0: p.y, shift: e.shiftKey }; live = mkShape(p.x, p.y, p.x, p.y, e.shiftKey); need(); return; }
      if (tool === 'conn') {
        var sh = topAt(p.x, p.y, function (o) { return (o.t === 'shape' && !isLine(o)) || o.t === 'node'; });
        if (sh) { drag = { kind: 'conn', from: sh.id, cur: p }; hoverId = null; need(); } return;
      }
      /* select */
      var bd = badgeAt(p.x, p.y); if (bd) { sel = new Set([bd.id]); toggleCollapse(); return; }
      if (sel.size === 1) {
        var so = byId().get(Array.from(sel)[0]);
        if (so && ROT[so.t]) { var rh = worldPt(so, so.w / 2, -26 / view.z); if (Math.hypot(p.x - rh.x, p.y - rh.y) < 13 / view.z) { drag = { kind: 'rotate', id: so.id, before: page.objs }; return; } }
        if (so && resizable(so)) { var hp = worldPt(so, so.w + 5 / view.z, so.h + 5 / view.z); if (Math.hypot(p.x - hp.x, p.y - hp.y) < 13 / view.z) { drag = { kind: 'resize', id: so.id, before: page.objs }; return; } }
      }
      var hit = topAt(p.x, p.y);
      if (hit) {
        if (e.shiftKey) { if (sel.has(hit.id)) sel.delete(hit.id); else sel.add(hit.id); }
        else if (!sel.has(hit.id)) sel = new Set([hit.id]);
        var ids = new Set(sel); sel.forEach(function (id) { var o = byId().get(id); if (o && o.t === 'node') descendants(page.objs, id).forEach(function (d) { ids.add(d); }); });
        drag = { kind: 'move', before: page.objs, ids: ids, x0: p.x, y0: p.y, moved: false }; renderChrome(); need();
      } else {
        if (!e.shiftKey) sel.clear();
        drag = { kind: 'marquee', x0: p.x, y0: p.y, rect: null, add: e.shiftKey }; renderChrome(); need();
      }
    });
    cv.addEventListener('pointermove', function (e) {
      var rc = cv.getBoundingClientRect(), rec = pointers.get(e.pointerId); if (rec) { rec.x = e.clientX - rc.left; rec.y = e.clientY - rc.top; }
      if (gesture && pointers.size >= 2) {
        var ps = Array.from(pointers.values()), d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), cx = (ps[0].x + ps[1].x) / 2, cy = (ps[0].y + ps[1].y) / 2;
        view.x += cx - gesture.cx; view.y += cy - gesture.cy; if (gesture.d > 0) zoomAt(cx, cy, view.z * d / gesture.d); gesture.d = d; gesture.cx = cx; gesture.cy = cy; need(); return;
      }
      var p = worldOf(e); cursorW = p;
      if (!drag) { if (tool === 'eraser') need(); return; }
      if (drag.kind === 'pan') { view.x = drag.vx + (p.sx - drag.sx); view.y = drag.vy + (p.sy - drag.sy); need(); return; }
      if (drag.kind === 'ink') {
        if (drag.snap) { var sn = drag.snap, tt = clamp((p.x - sn.tx) * sn.ux + (p.y - sn.ty) * sn.uy, -20, sn.len + 20); live.p = [live.p[0], live.p[1], live.p[2], r1(sn.tx + sn.ux * tt), r1(sn.ty + sn.uy * tt), 0.5]; need(); return; }
        var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; if (!evs.length) evs = [e];
        evs.forEach(function (ce) { var q = worldOf(ce), L = live.p, lx = L[L.length - 3], ly = L[L.length - 2]; if (Math.hypot(q.x - lx, q.y - ly) * view.z >= 1.2) live.p.push(r1(q.x), r1(q.y), ce.pointerType === 'pen' ? ce.pressure || 0.5 : 0.5); });
        need(); return;
      }
      if (drag.kind === 'erase') { eraseAt(p); return; }
      if (drag.kind === 'shape') { live = mkShape(drag.x0, drag.y0, p.x, p.y, e.shiftKey); need(); return; }
      if (drag.kind === 'conn') { drag.cur = p; var h = topAt(p.x, p.y, function (o) { return ((o.t === 'shape' && !isLine(o)) || o.t === 'node') && o.id !== drag.from; }); hoverId = h ? h.id : null; need(); return; }
      if (drag.kind === 'move') {
        var dx = p.x - drag.x0, dy = p.y - drag.y0; if (!drag.moved && Math.hypot(dx, dy) * view.z < 3) return; drag.moved = true;
        page.objs = drag.before.map(function (o) { return drag.ids.has(o.id) ? translate(o, dx, dy) : o; }); need(); return;
      }
      if (drag.kind === 'rotate') {
        var ro1 = byIdOf(drag.before, drag.id), ang = Math.atan2(p.y - (ro1.y + ro1.h / 2), p.x - (ro1.x + ro1.w / 2)) + Math.PI / 2, deg = ang * 180 / Math.PI, snapd = Math.round(deg / 15) * 15;
        if (e.shiftKey || Math.abs(deg - snapd) < 1.5) ang = snapd * Math.PI / 180;
        page.objs = replaceObj(drag.before, drag.id, { a: Math.round(ang * 10000) / 10000 }); need(); return;
      }
      if (drag.kind === 'resize') { var ro0 = byIdOf(drag.before, drag.id), lp0 = localPt(ro0, p.x, p.y), dims = sizeFor(ro0, lp0[0], lp0[1]); page.objs = replaceObj(drag.before, drag.id, fitTL(ro0, dims[0], dims[1])); need(); return; }
      if (drag.kind === 'marquee') { drag.rect = [Math.min(drag.x0, p.x), Math.min(drag.y0, p.y), Math.max(drag.x0, p.x), Math.max(drag.y0, p.y)]; need(); }
    });
    function byIdOf(objs, id) { return objs.find(function (o) { return o.id === id; }); }
    function endPointer(e) {
      pointers.delete(e.pointerId); try { cv.releasePointerCapture(e.pointerId); } catch (er) { }
      if (gesture) { if (pointers.size < 2) gesture = null; return; }
      if (!drag) return; var d = drag; drag = null; updateCursor();
      if (d.kind === 'ink' && live) {
        var s = live; live = null; if (s.p.length === 3) s.p.push(s.p[0] + 0.01, s.p[1], s.p[2]);
        s.b = strokeBox(s.p, s.w); if (s.pr && s.p.length / 3 < 3) s.pr = false; pushHist(page.objs); page.objs = page.objs.concat([s]); dirty(); need(); renderChrome();
      } else if (d.kind === 'erase') { if (page.objs !== d.before) { pushHist(d.before); pruneSel(); dirty(); } need(); renderChrome(); }
      else if (d.kind === 'shape' && live) finishShape();
      else if (d.kind === 'conn') {
        var to = hoverId; hoverId = null;
        if (to && to !== d.from && !page.objs.some(function (o) { return o.t === 'conn' && o.a === d.from && o.b === to; })) change(page.objs.concat([{ id: uid(), t: 'conn', a: d.from, b: to, c: prefs.color, sw: Math.max(2, Math.min(6, SIZES[prefs.size])) }]));
        need();
      }
      else if (d.kind === 'move') { if (d.moved) { var cur = page.objs; page.objs = d.before; pushHist(d.before); page.objs = cur; dirty(); } renderChrome(); need(); }
      else if (d.kind === 'resize' || d.kind === 'rotate') { if (page.objs !== d.before) { var c2 = page.objs; pushHist(d.before); page.objs = c2; dirty(); } need(); }
      else if (d.kind === 'marquee') {
        if (d.rect) { var r = d.rect, hid = hidden(); page.objs.forEach(function (o) { if (hid.has(o.id) || o.t === 'conn') return; var b = bboxOf(o); if (b[2] >= r[0] && b[0] <= r[2] && b[3] >= r[1] && b[1] <= r[3]) sel.add(o.id); }); }
        renderChrome(); need();
      } else need();
    }
    cv.addEventListener('mousedown', function (e) { e.preventDefault(); });
    cv.addEventListener('pointerup', endPointer); cv.addEventListener('pointercancel', endPointer);
    cv.addEventListener('pointerleave', function () { cursorW = null; if (tool === 'eraser') need(); });
    cv.addEventListener('dblclick', function (e) {
      var p = worldOf(e), hit = topAt(p.x, p.y, function (o) { return o.t !== 'stroke' && o.t !== 'image' && !isLine(o); });
      if (hit && MATH[hit.t]) { if (hit.t === 'fracbar') toggleFrac(hit, p); else openProps(hit.id); return; }
      if (hit) { startEdit(hit.id, false); return; }
      if (mode === 'mind') addRoot(p.x, p.y);
      else if (mode === 'flow') { shapeKind = 'round'; var o = mkShape(p.x - 80, p.y - 45, p.x + 80, p.y + 45, false); pushHist(page.objs); page.objs = page.objs.concat([o]); sel = new Set([o.id]); need(); startEdit(o.id, true); }
      else if (tool !== 'eraser') { tool = 'text'; var ts = TEXT_SIZES[prefs.size], t0 = { id: uid(), t: 'text', x: r1(p.x), y: r1(p.y - ts / 2), tx: '', ts: ts, c: prefs.color, w: 24, h: ts * 1.25 }; pushHist(page.objs); page.objs = page.objs.concat([t0]); need(); startEdit(t0.id, true); renderChrome(); }
    });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault(); var p = evPt(e);
      if (e.ctrlKey || e.metaKey) zoomAt(p.sx, p.sy, view.z * Math.exp(-e.deltaY * 0.01));
      else { view.x -= e.deltaX; view.y -= e.deltaY; syncView(); }
    }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    function eraseAt(p) {
      var r = eraseR(), hid = hidden(), rem = new Set(), out = [], changed = false;
      page.objs.forEach(function (o) {
        if (hid.has(o.id)) { out.push(o); return; }
        if (o.t === 'stroke' && prefs.eraseParts) { var cut = cutStroke(o, p.x, p.y, r); if (cut) { changed = true; cut.forEach(function (n) { out.push(n); }); } else out.push(o); return; }
        var hit = (o.t === 'stroke' || o.t === 'conn') ? hitObj(o, p.x, p.y, r) : hitObj(o, p.x, p.y, 0);
        if (hit) { rem.add(o.id); changed = true; }
        out.push(o);
      });
      if (changed) page.objs = rem.size ? removeIds(out, rem) : out;
      need();
    }
    function mkShape(x0, y0, x1, y1, shift) {
      var k = shapeKind, o = { id: uid(), t: 'shape', k: k, c: prefs.color, sw: Math.max(2, SIZES[prefs.size]), tx: '' };
      var dx = x1 - x0, dy = y1 - y0;
      if (shift) { if (isLine({ t: 'shape', k: k })) { var a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), L = Math.hypot(dx, dy); dx = L * Math.cos(a); dy = L * Math.sin(a); } else { var m = Math.max(Math.abs(dx), Math.abs(dy)); dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m; } }
      if (isLine(o)) { o.x = r1(x0); o.y = r1(y0); o.w = r1(dx); o.h = r1(dy); }
      else { o.x = r1(Math.min(x0, x0 + dx)); o.y = r1(Math.min(y0, y0 + dy)); o.w = r1(Math.abs(dx)); o.h = r1(Math.abs(dy)); if (k === 'note') o.f = '#fff59dcc'; else if (prefs.fill) o.f = tint(prefs.color, '33'); }
      if (k === 'note') { o.c = '#f9a825'; }
      return o;
    }
    function finishShape() {
      var o = live; live = null;
      if (isLine(o)) { if (Math.hypot(o.w, o.h) * view.z < 6) { o.w = 160; o.h = 0; } }
      else if (o.w * view.z < 10 || o.h * view.z < 10) { var def = o.k === 'diamond' ? [150, 110] : (o.k === 'note' ? [150, 130] : [160, 90]); o.x = r1(o.x - def[0] / 2 + o.w / 2); o.y = r1(o.y - def[1] / 2 + o.h / 2); o.w = def[0]; o.h = def[1]; }
      pushHist(page.objs); page.objs = page.objs.concat([o]); sel = new Set([o.id]); dirty(); need();
      if (!isLine(o)) { tool = 'select'; renderChrome(); startEdit(o.id, true); } else { tool = 'select'; renderChrome(); }
    }

    /* ----- keyboard ----- */
    function onKey(e) {
      if (!alive || !widgetEl || !document.body.contains(widgetEl)) return;
      var tag = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
      if (!modalEl.hidden) { if (e.key === 'Escape') closeModal(); return; }
      var k = e.key, ctrl = e.ctrlKey || e.metaKey;
      if (k === ' ' && !spaceDown) { spaceDown = true; cv.style.cursor = 'grab'; e.preventDefault(); return; }
      if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
      if (ctrl && (k === 'd' || k === 'D')) { e.preventDefault(); dupSel(); return; }
      if (ctrl && (k === 'a' || k === 'A')) { e.preventDefault(); sel = new Set(page.objs.filter(function (o) { return o.t !== 'conn' && !hidden().has(o.id); }).map(function (o) { return o.id; })); renderChrome(); need(); return; }
      if (ctrl) return;
      if (k === 'Escape') { if (pop) closePop(); else if (sel.size) { sel.clear(); renderChrome(); need(); } else if (focusMode) setFocus(false); else if (tool !== 'select') setTool('select'); else host.close && host.close(); return; }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); if (sel.size > 1) requireUnlock(deleteSel); else deleteSel(); return; }
      if (k === 'Tab' && sel.size) { e.preventDefault(); if (hasNodeSel()) addChild(); return; }
      if (k === 'Enter' && sel.size) { e.preventDefault(); if (hasNodeSel()) addSibling(); else if (sel.size === 1) { var eo = byId().get(Array.from(sel)[0]); if (eo && MATH[eo.t]) openProps(eo.id); else startEdit(Array.from(sel)[0], false); } return; }
      if (k === 'F2' && sel.size === 1) { e.preventDefault(); startEdit(Array.from(sel)[0], false); return; }
      if (k.indexOf('Arrow') === 0 && sel.size) { e.preventDefault(); var st = e.shiftKey ? 24 : 4, dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0; var ids = new Set(sel); sel.forEach(function (id) { var o = byId().get(id); if (o && o.t === 'node') descendants(page.objs, id).forEach(function (d) { ids.add(d); }); }); change(page.objs.map(function (o) { return ids.has(o.id) ? translate(o, dx, dy) : o; })); return; }
      var map = kidMode ? { v: 'select', p: 'pen', h: 'hl', e: 'eraser', s: 'shape' } : { v: 'select', p: 'pen', h: 'hl', e: 'eraser', t: 'text', s: 'shape', c: 'conn' };
      if (map[k.toLowerCase()] && !e.altKey) { setTool(map[k.toLowerCase()]); return; }
      if (k === 'f' || k === 'F') { setFocus(!focusMode); return; }
      if (k === '=' || k === '+') { zoomAt(W / 2, Hh / 2, view.z * 1.2); return; }
      if (k === '-') { zoomAt(W / 2, Hh / 2, view.z / 1.2); return; }
      if (k === '0') { zoomAt(W / 2, Hh / 2, 1); return; }
      if (k === '1') { fitView(); return; }
    }
    function onKeyUp(e) { if (e.key === ' ') { spaceDown = false; updateCursor(); } }
    document.addEventListener('keydown', onKey); document.addEventListener('keyup', onKeyUp);

    /* Full screen (the browser's, via the button here or F11): DrawDeck takes the whole screen — the TeachersDeck title bar,
       top menu and docks are hidden (css/drawdeck.css, body.dd-fs) until full screen is left. */
    function syncFullscreen() {
      var fs = !!document.fullscreenElement || (window.innerWidth >= screen.width && window.innerHeight >= screen.height);
      document.body.classList.toggle('dd-fs', fs);
      setTimeout(resize, 60);
    }
    document.addEventListener('fullscreenchange', syncFullscreen); window.addEventListener('resize', syncFullscreen);
    syncFullscreen();
    function hasNodeSel() { var by = byId(), y = false; sel.forEach(function (id) { var o = by.get(id); if (o && o.t === 'node') y = true; }); return y; }

    /* ----- chrome (toolbars) ----- */
    function updateCursor() {
      if (spaceDown || (drag && drag.kind === 'pan')) return;
      cv.style.cursor = { select: 'default', hand: 'grab', pen: 'crosshair', hl: 'crosshair', eraser: 'none', text: 'text', shape: 'crosshair', conn: 'crosshair' }[tool] || 'default';
    }
    function setTool(k) {
      endEdit(true); tool = k; if (k === 'shape' && mode === 'draw' && FLOW_SHAPES.indexOf(shapeKind) > -1 && DRAW_SHAPES.indexOf(shapeKind) < 0) shapeKind = 'rect';
      if (k === 'shape' && mode === 'flow' && FLOW_SHAPES.indexOf(shapeKind) < 0) shapeKind = 'round';
      updateCursor(); need(); renderChrome();
    }
    function setMode(m) {
      endEdit(true); mode = m; board.mode = m; dirty();
      if (m === 'flow' && FLOW_SHAPES.indexOf(shapeKind) < 0) shapeKind = 'round';
      if (m === 'draw' && DRAW_SHAPES.indexOf(shapeKind) < 0) shapeKind = 'rect';
      if (m === 'mind') { if (tool === 'shape' || tool === 'conn') tool = 'select'; } else if (tool === 'conn' && m !== 'flow') tool = 'select';
      need(); renderChrome();
    }
    function setFocus(on) { focusMode = on; rootEl.classList.toggle('dd-focus', on); unfocusEl.hidden = !on; setTimeout(resize, 0); }
    function btn(act, v, ic, title, on, extra) { return '<button type="button" class="dd-btn' + (on ? ' on' : '') + (extra ? ' ' + extra : '') + '" data-act="' + act + '"' + (v != null ? ' data-v="' + esc(v) + '"' : '') + ' title="' + esc(title) + '" aria-label="' + esc(title) + '"' + (on ? ' aria-pressed="true"' : '') + '>' + icon(IC[ic]) + '</button>'; }
    function renderChrome() {
      if (!board || !page) return;
      var h = H(), nPages = board.pages.length;
      topEl.innerHTML =
        '<div class="dd-grp"><button type="button" class="dd-btn dd-wide" data-act="boards" aria-haspopup="true" title="' + esc(t('dd_board')) + '"><span class="dd-boardname">' + esc(board.name) + '</span> ▾</button>' +
        '<button type="button" class="dd-btn" data-act="prevpage" title="' + esc(t('dd_prev_page')) + '"' + (pi ? '' : ' disabled') + '>◀</button>' +
        '<span class="dd-pageno" title="' + esc(t('dd_page', { n: pi + 1, total: nPages })) + '">' + (pi + 1) + ' / ' + nPages + '</span>' +
        '<button type="button" class="dd-btn" data-act="nextpage" title="' + esc(t('dd_next_page')) + '"' + (pi < nPages - 1 ? '' : ' disabled') + '>▶</button>' +
        '<button type="button" class="dd-btn" data-act="addpage" title="' + esc(t('dd_add_page')) + '">' + icon(IC.plus) + '</button></div>' +
        (kidMode ? '' : '<div class="dd-tabs" role="tablist">' + ['draw', 'mind', 'flow'].map(function (m) { return '<button type="button" role="tab" class="dd-tab' + (mode === m ? ' on' : '') + '" aria-selected="' + (mode === m) + '" data-act="mode" data-v="' + m + '">' + esc(t('dd_mode_' + m)) + '</button>'; }).join('') + '</div>') +
        '<div class="dd-grp">' + btn('undo', null, 'undo', t('dd_undo'), false, h.u.length ? '' : 'dis') + btn('redo', null, 'redo', t('dd_redo'), false, h.r.length ? '' : 'dis') + '</div>' +
        '<div class="dd-grp">' + btn('zout', null, 'minus', t('dd_zoom_out')) + '<button type="button" class="dd-btn dd-zoom" data-act="zreset" title="' + esc(t('dd_zoom_reset')) + '">' + Math.round(view.z * 100) + '%</button>' + btn('zin', null, 'plus', t('dd_zoom_in')) + btn('zfit', null, 'fit', t('dd_zoom_fit')) + '</div>' +
        '<div class="dd-grp dd-right">' + (kidMode ? '' : btn('tpl', null, 'tpl', t('dd_tpl'))) + btn('bgmenu', null, 'bg', t('dd_bg')) + (!kidMode && mode === 'mind' ? btn('outline', null, 'outline', t('dd_outline')) : '') + btn('more', null, 'more', '⋯') + btn('focus', null, 'focus', t('dd_focus')) + btn('fullscreen', null, 'full', t('doc_fullscreen')) + '</div>';
      var rail = btn('tool', 'select', 'select', t('dd_t_select'), tool === 'select') + btn('tool', 'hand', 'hand', t('dd_t_hand'), tool === 'hand') +
        btn('tool', 'pen', 'pen', t('dd_t_pen'), tool === 'pen') + btn('tool', 'hl', 'hl', t('dd_t_hl'), tool === 'hl') + btn('tool', 'eraser', 'eraser', t('dd_t_eraser'), tool === 'eraser');
      if (!kidMode) rail += btn('tool', 'text', 'text', t('dd_t_text'), tool === 'text') + btn('image', null, 'image', t('dd_t_image')) + btn('math', null, 'math', t('dd_t_math'));
      if (mode !== 'mind') rail += '<span class="dd-sep"></span>' + btn('tool', 'shape', 'shape', t('dd_t_shape'), tool === 'shape');
      if (!kidMode && mode === 'flow') rail += btn('tool', 'conn', 'conn', t('dd_t_conn'), tool === 'conn');
      if (!kidMode && mode === 'mind') rail += '<span class="dd-sep"></span>' + btn('topic', null, 'topic', t('dd_add_topic')) + btn('child', null, 'child', t('dd_add_child')) + btn('sibling', null, 'sib', t('dd_add_sib')) + btn('collapse', null, 'collapse', t('dd_collapse')) + btn('tidy', null, 'layout', t('dd_layout'));
      rail += '<span class="dd-sep"></span>' + btn('dup', null, 'dup', t('dd_dup')) + btn('del', null, 'trash', t('dd_delete'));
      railEl.innerHTML = rail;
      var cc = curColor(), cs = curSize(), pal = PALETTE.map(function (c) { return '<button type="button" class="dd-sw' + (c.toLowerCase() === String(cc).toLowerCase() ? ' on' : '') + '" data-act="color" data-v="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="' + t('dd_color') + ' ' + c + '"></button>'; }).join('');
      var szs = SIZES.map(function (s, i) { var dsz = Math.min(20, 4 + s * 0.6); return '<button type="button" class="dd-size' + (i === cs ? ' on' : '') + '" data-act="size" data-v="' + i + '" title="' + t('dd_size') + ' ' + (i + 1) + '" aria-label="' + t('dd_size') + ' ' + (i + 1) + '"><i style="width:' + dsz + 'px;height:' + dsz + 'px"></i></button>'; }).join('');
      var extra = '';
      if (tool === 'shape' || (mode === 'flow' && sel.size)) {
        var kinds = mode === 'flow' ? FLOW_SHAPES : DRAW_SHAPES;
        extra += '<span class="dd-sep"></span>' + kinds.map(function (k) { return '<button type="button" class="dd-kind' + (shapeKind === k ? ' on' : '') + '" data-act="shape" data-v="' + k + '" title="' + esc(t('dd_s_' + k)) + '">' + esc(t('dd_s_' + k)) + '</button>'; }).join('') +
          '<label class="dd-chk"><input type="checkbox" data-act="fill"' + (prefs.fill ? ' checked' : '') + '> ' + esc(t('dd_fill')) + '</label>';
      }
      if (sel.size === 1) { var po = byId().get(Array.from(sel)[0]); if (po && MATH[po.t] && po.t !== 'protractor') extra += '<span class="dd-sep"></span><button type="button" class="dd-kind on" data-act="props">' + esc(t('dd_props')) + '</button>'; }
      if (tool === 'eraser') extra += '<span class="dd-sep"></span><button type="button" class="dd-kind' + (prefs.eraseParts ? ' on' : '') + '" data-act="erasemode" data-v="part">' + esc(t('dd_er_part')) + '</button><button type="button" class="dd-kind' + (prefs.eraseParts ? '' : ' on') + '" data-act="erasemode" data-v="whole">' + esc(t('dd_er_whole')) + '</button>';
      if (mode === 'mind') extra += '<span class="dd-sep"></span><button type="button" class="dd-kind' + ((board.layout || 'both') === 'both' ? ' on' : '') + '" data-act="layout" data-v="both">' + esc(t('dd_layout_both')) + '</button><button type="button" class="dd-kind' + (board.layout === 'right' ? ' on' : '') + '" data-act="layout" data-v="right">' + esc(t('dd_layout_right')) + '</button>';
      updateCursor();
      botEl.innerHTML = '<div class="dd-pal">' + pal + '<label class="dd-sw dd-custom" title="' + esc(t('dd_custom')) + '"><input type="color" data-act="customcolor" value="' + (/^#[0-9a-f]{6}$/i.test(cc) ? cc : '#1a1a1a') + '" aria-label="' + esc(t('dd_custom')) + '"></label></div><span class="dd-sep"></span><div class="dd-sizes">' + szs + '</div>' + extra;
    }

    /* ----- popovers & dialogs ----- */
    function openPop(anchor, html) {
      closePop(); popEl.innerHTML = html; popEl.hidden = false; pop = anchor;
      var rr = rootEl.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
      popEl.style.left = Math.max(6, Math.min(ar.left - rr.left, rr.width - popEl.offsetWidth - 6)) + 'px'; popEl.style.top = (ar.bottom - rr.top + 4) + 'px';
    }
    function closePop() { if (pop) { pop = null; popEl.hidden = true; popEl.innerHTML = ''; } }
    function menuItem(act, v, label, danger) { return '<button type="button" class="dd-mi' + (danger ? ' danger' : '') + '" data-act="' + act + '"' + (v != null ? ' data-v="' + esc(v) + '"' : '') + '>' + esc(label) + '</button>'; }
    function closeModal() { modalEl.hidden = true; modalEl.innerHTML = ''; }
    function download(blob, name) { try { host.download(blob, name); } catch (e) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); } }
    function slug(s) { return String(s || 'board').toLowerCase().replace(/[^a-z0-9\u00c0-\u1ef9]+/gi, '-').replace(/^-+|-+$/g, '') || 'board'; }
    function rulerEdgeAt(x, y) {       // a pen stroke that starts on a ruler's edge runs straight along it
      var objs = page.objs, hid = hidden();
      for (var i = objs.length - 1; i >= 0; i--) {
        var o = objs[i]; if (o.t !== 'ruler' || hid.has(o.id)) continue;
        var a = worldPt(o, 0, 0), b = worldPt(o, o.w, 0), ux = (b.x - a.x) / o.w, uy = (b.y - a.y) / o.w;
        if (distSeg(x, y, a.x, a.y, b.x, b.y) <= 16 / view.z) { var tt = clamp((x - a.x) * ux + (y - a.y) * uy, 0, o.w); return { tx: a.x, ty: a.y, ux: ux, uy: uy, len: o.w, x0: a.x + ux * tt, y0: a.y + uy * tt }; }
      }
      return null;
    }
    function toggleFrac(o, p) {
      var lp = localPt(o, p.x, p.y), i = clamp(Math.floor(lp[0] / (o.w / o.n)), 0, o.n - 1), sh = (o.sh || []).slice(), at = sh.indexOf(i);
      if (at > -1) sh.splice(at, 1); else sh.push(i);
      change(replaceObj(page.objs, o.id, { sh: sh }));
    }
    function addMath(kind) {
      var c = toWorld(W / 2, Hh / 2), id = uid(), o;
      if (kind === 'numline') o = { id: id, t: 'numline', x: c.x - 400, y: c.y - 32, w: 800, h: 64, min: 0, max: 10, step: 1, a: 0 };
      else if (kind === 'ruler') o = { id: id, t: 'ruler', x: c.x - 300, y: c.y - 26, w: 15 * K, h: 52, unit: 'cm', a: 0 };
      else if (kind === 'protractor') o = { id: id, t: 'protractor', x: c.x - 220, y: c.y - 122, w: 440, h: 244, a: 0 };
      else if (kind === 'fracbar') o = { id: id, t: 'fracbar', x: c.x - 360, y: c.y - 28, w: 720, h: 56, n: 4, sh: [], c: prefs.color === '#1a1a1a' || prefs.color === '#ffffff' ? '#1e88e5' : prefs.color, lab: true };
      else if (kind === 'grid') o = { id: id, t: 'grid', x: c.x - 240, y: c.y - 180, w: 480, h: 360, rows: 3, cols: 3, hdr: null, seq: null, mult: false, c: '#1e88e5' };
      else o = { id: id, t: 'compass', x: c.x - 160, y: c.y - 160, w: 320, h: 320, unit: 'cm', a: 0 };   // 320px = 4cm radius at K=40
      if (!o.a) delete o.a;
      change(page.objs.concat([o])); sel = new Set([id]); tool = 'select'; renderChrome(); need();
    }
    function openProps(id) {
      var o = byId().get(id); if (!o || !MATH[o.t] || o.t === 'protractor') return;
      function inp(key, label, val, type) { return '<label class="dd-fld"><span>' + esc(label) + '</span><input data-f="' + key + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"' + (type === 'number' ? ' step="any"' : '') + '></label>'; }
      function chk(key, label, on) { return '<label class="dd-fld dd-chkrow"><input data-f="' + key + '" type="checkbox"' + (on ? ' checked' : '') + '><span>' + esc(label) + '</span></label>'; }
      var f = '';
      if (o.t === 'numline') f = inp('min', t('dd_p_min'), o.min, 'number') + inp('max', t('dd_p_max'), o.max, 'number') + inp('step', t('dd_p_step'), o.step, 'number');
      else if (o.t === 'ruler') f = '<label class="dd-fld"><span>' + esc(t('dd_p_unit')) + '</span><select data-f="unit"><option value="cm"' + (o.unit !== 'in' ? ' selected' : '') + '>' + esc(t('dd_u_cm')) + '</option><option value="in"' + (o.unit === 'in' ? ' selected' : '') + '>' + esc(t('dd_u_in')) + '</option></select></label>' + inp('len', t('dd_p_len'), fmtNum(o.w / (o.unit === 'in' ? K * 2.54 : K)), 'number');
      else if (o.t === 'fracbar') f = inp('n', t('dd_p_parts'), o.n, 'number') + chk('lab', t('dd_p_labels'), o.lab);
      else if (o.t === 'grid') f = inp('rows', t('dd_p_rows'), o.rows, 'number') + inp('cols', t('dd_p_cols'), o.cols, 'number') + inp('hdr', t('dd_p_hdr'), (o.hdr || []).join(', ')) + inp('seq', t('dd_p_seq'), o.seq == null ? '' : o.seq, 'number') + chk('mult', t('dd_p_mult'), o.mult);
      else f = '<label class="dd-fld"><span>' + esc(t('dd_p_unit')) + '</span><select data-f="unit"><option value="cm"' + (o.unit !== 'in' ? ' selected' : '') + '>' + esc(t('dd_u_cm')) + '</option><option value="in"' + (o.unit === 'in' ? ' selected' : '') + '>' + esc(t('dd_u_in')) + '</option></select></label>' + inp('radius', t('dd_p_radius'), fmtNum((o.w / 2) / (o.unit === 'in' ? K * 2.54 : K)), 'number');
      modalEl.innerHTML = '<div class="dd-card" role="dialog" aria-label="' + esc(t('dd_props')) + '"><h3>' + esc(t('dd_m_' + o.t)) + '</h3><div class="dd-form">' + f + '</div><div class="dd-card-btns"><button type="button" class="dd-kind on" data-act="props-apply" data-v="' + o.id + '">' + esc(t('dd_apply')) + '</button><button type="button" class="dd-kind" data-act="modal-close">' + esc(t('dd_cancel')) + '</button></div></div>';
      modalEl.hidden = false; var first = modalEl.querySelector('input,select'); if (first) first.focus();
    }
    function applyProps(id) {
      var o = byId().get(id); if (!o) return;
      var val = function (k) { var el = modalEl.querySelector('[data-f="' + k + '"]'); return el ? (el.type === 'checkbox' ? el.checked : el.value) : ''; }, num = function (k, d) { var n = parseFloat(val(k)); return isFinite(n) ? n : d; };
      var patch = {};
      if (o.t === 'numline') { var mn = num('min', 0), mx = num('max', 10), stp = Math.abs(num('step', 1)) || 1; if (mx <= mn) mx = mn + stp; if ((mx - mn) / stp > 200) stp = (mx - mn) / 200; patch = { min: mn, max: mx, step: stp }; }
      else if (o.t === 'ruler') { var unit = val('unit') === 'in' ? 'in' : 'cm', len = clamp(num('len', 15), 3, 100); patch = { unit: unit, w: Math.round(len * (unit === 'in' ? K * 2.54 : K)) }; }
      else if (o.t === 'fracbar') { var np = clamp(Math.round(num('n', 4)), 1, 24); patch = { n: np, lab: !!val('lab'), sh: (o.sh || []).filter(function (i) { return i < np; }) }; }
      else if (o.t === 'grid') { var hd = String(val('hdr')).split(',').map(function (x) { return x.trim(); }); while (hd.length && !hd[hd.length - 1]) hd.pop(); var sq = String(val('seq')).trim(); patch = { rows: clamp(Math.round(num('rows', 3)), 1, 30), cols: clamp(Math.round(num('cols', 3)), 1, 20), hdr: hd.length ? hd : null, seq: sq === '' || !isFinite(parseFloat(sq)) ? null : Math.round(parseFloat(sq)), mult: !!val('mult') }; }
      else if (o.t === 'compass') { var cunit = val('unit') === 'in' ? 'in' : 'cm', rad = clamp(num('radius', 4), 0.5, 50), dia = Math.round(rad * 2 * (cunit === 'in' ? K * 2.54 : K)); patch = { unit: cunit, w: dia, h: dia }; }
      closeModal(); change(replaceObj(page.objs, id, patch));
    }
    function openMathMenu(anchor) {
      openPop(anchor, '<div class="dd-menu"><div class="dd-mh">' + esc(t('dd_t_math')) + '</div>' + ['numline', 'ruler', 'protractor', 'fracbar', 'grid', 'compass'].map(function (k) { return menuItem('mathadd', k, t('dd_m_' + k)); }).join('') + '</div>');
    }
    var TEMPLATES = ['tchart', 'venn', 'kwl', 'story', 'place', '100', 'mult', 'fracwall', 'numline', 'coord', 'writing'];
    function openTplMenu(anchor) {
      openPop(anchor, '<div class="dd-menu"><div class="dd-mh">' + esc(t('dd_tpl')) + '</div>' + TEMPLATES.map(function (k) { return menuItem('tplpick', k, t('tpl_' + k)); }).join('') + '</div>');
    }
    function buildTemplate(key) {
      var c = toWorld(W / 2, Hh / 2), ink = board.bg === 'chalk' ? '#ffffff' : '#1a1a1a', out = [];
      function text(x, y, k, ts) { var o = { id: uid(), t: 'text', x: r1(x), y: r1(y), tx: t(k), ts: ts, c: ink, w: 24, h: ts * 1.25 }, sz = freeTextSize(o); o.w = sz.w; o.h = sz.h; return o; }
      function grid(x, y, w, h, rows, cols, extra) { return Object.assign({ id: uid(), t: 'grid', x: r1(x), y: r1(y), w: w, h: h, rows: rows, cols: cols, hdr: null, seq: null, mult: false, c: '#1e88e5' }, extra || {}); }
      function oval(x, y, w, h, col) { return { id: uid(), t: 'shape', k: 'ellipse', x: r1(x), y: r1(y), w: w, h: h, c: col, f: tint(col, '33'), sw: 4, tx: '' }; }
      if (key === 'venn') out.push(oval(c.x - 300, c.y - 170, 360, 340, '#1e88e5'), oval(c.x - 60, c.y - 170, 360, 340, '#e53935'), text(c.x - 250, c.y - 225, 'tt_a', 30), text(c.x + 90, c.y - 225, 'tt_b', 30), text(c.x - 28, c.y - 16, 'tt_both', 26));
      else if (key === 'tchart') out.push(grid(c.x - 340, c.y - 260, 680, 520, 6, 2, { hdr: [t('tt_a'), t('tt_b')] }));
      else if (key === 'kwl') out.push(grid(c.x - 420, c.y - 270, 840, 540, 1, 3, { hdr: [t('tt_know'), t('tt_want'), t('tt_learned')] }));
      else if (key === 'story') out.push(grid(c.x - 450, c.y - 190, 900, 380, 1, 5, { hdr: [t('tt_char'), t('tt_set'), t('tt_prob'), t('tt_ev'), t('tt_sol')] }));
      else if (key === 'place') out.push(grid(c.x - 380, c.y - 200, 760, 400, 3, 4, { hdr: [t('tt_th'), t('tt_h'), t('tt_te'), t('tt_o')] }));
      else if (key === '100') out.push(grid(c.x - 300, c.y - 300, 600, 600, 10, 10, { seq: 1 }));
      else if (key === 'mult') out.push(grid(c.x - 330, c.y - 330, 660, 660, 10, 10, { mult: true }));
      else if (key === 'fracwall') [1, 2, 3, 4, 5, 6, 8, 10, 12].forEach(function (d, i) { out.push({ id: uid(), t: 'fracbar', x: r1(c.x - 380), y: r1(c.y - 250 + i * 54), w: 760, h: 46, n: d, sh: [], c: BRANCH[i % BRANCH.length], lab: true }); });
      else if (key === 'numline') out.push({ id: uid(), t: 'numline', x: r1(c.x - 450), y: r1(c.y - 32), w: 900, h: 64, min: 0, max: 10, step: 1 });
      return out;
    }
    function applyTemplate(key) {
      if (key === 'coord' || key === 'writing') { board.bg = key === 'coord' ? 'axes' : 'writing'; defaultInkForBg(); dirty(); need(); renderChrome(); return; }
      var was = page.objs.length, objs = buildTemplate(key); if (!objs.length) return;
      change(page.objs.concat(objs)); sel = new Set(objs.map(function (o) { return o.id; })); tool = 'select'; renderChrome(); need();
      if (!was) setTimeout(fitView, 0);
    }
    function insertImage(blob, at) {
      if (!blob || !/^image\//.test(blob.type || '')) { toast(t('dd_img_fail')); return Promise.resolve(); }
      return new Promise(function (res, rej) {
        var url = URL.createObjectURL(blob), im = new Image();
        im.onload = function () { URL.revokeObjectURL(url); res(im); }; im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); }; im.src = url;
      }).then(function (im) {
        var nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height; if (!nw || !nh) throw new Error('size');
        var sc = Math.min(1, 1600 / Math.max(nw, nh)), cw = Math.max(1, Math.round(nw * sc)), ch = Math.max(1, Math.round(nh * sc));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(im, 0, 0, cw, ch);
        var src = c.toDataURL(blob.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.88);
        var disp = Math.min(cw, (W * 0.5) / view.z), k = disp / cw, dw = Math.round(cw * k), dh = Math.round(ch * k), ctr = at || toWorld(W / 2, Hh / 2);
        var o = { id: uid(), t: 'image', x: r1(ctr.x - dw / 2), y: r1(ctr.y - dh / 2), w: dw, h: dh, nw: cw, nh: ch, src: src };
        getImg(src); change(page.objs.concat([o])); sel = new Set([o.id]); tool = 'select'; renderChrome(); need();
      }).catch(function () { toast(t('dd_img_fail')); });
    }
    var imgFiles = [];
    function openImageMenu(anchor) {
      var render = function (list) {
        imgFiles = list;
        var items = menuItem('imgcomputer', null, t('dd_img_computer')) + '<hr>';
        items += list.length ? list.slice(0, 30).map(function (f, i) { return menuItem('imgfile', String(i), f.name || ('#' + (i + 1))); }).join('') : '<div class="dd-mi dd-none">' + esc(t('dd_img_none')) + '</div>';
        openPop(anchor, '<div class="dd-menu"><div class="dd-mh">' + esc(t('dd_img_files')) + '</div>' + items + '</div>');
      };
      try { host.idb.getAll('files').then(function (all) { render((all || []).filter(function (f) { return f && f.blob && /^image\//.test(f.blob.type || ''); })); }, function () { render([]); }); } catch (e) { render([]); }
    }
    function onPaste(e) {
      if (!alive || !widgetEl || !document.body.contains(widgetEl)) return;
      var tg = e.target; if (tg && (/INPUT|TEXTAREA|SELECT/.test(tg.tagName) || tg.isContentEditable)) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { var f = items[i].getAsFile(); if (f) { e.preventDefault(); insertImage(f); return; } }
    }
    document.addEventListener('paste', onPaste);
    stageEl.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') > -1) e.preventDefault(); });
    stageEl.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files; if (!files || !files.length) return; e.preventDefault();
      var at = worldOf(e); Array.prototype.slice.call(files).filter(function (f) { return /^image\//.test(f.type); }).forEach(function (f, i) { insertImage(f, { x: at.x + i * 30, y: at.y + i * 30 }); });
    });
    imgFileEl.addEventListener('change', function () { var f = imgFileEl.files && imgFileEl.files[0]; if (f) insertImage(f); imgFileEl.value = ''; });

    /* ----- PDF of every page: each page is drawn to a canvas, saved as a JPEG and wrapped in a minimal PDF (no library) ----- */
    function pageRegion(objs, minW, minH) {
      var b = contentBounds(objs), pad = 48, w, h, x0, y0;
      if (b) { w = Math.max(minW, b[2] - b[0] + pad * 2); h = Math.max(minH, b[3] - b[1] + pad * 2); x0 = (b[0] + b[2]) / 2 - w / 2; y0 = (b[1] + b[3]) / 2 - h / 2; }
      else { w = minW; h = minH; x0 = -w / 2; y0 = -h / 2; }
      return { x0: x0, y0: y0, w: w, h: h };
    }
    function buildPdf(pages) {
      var enc = new TextEncoder(), chunks = [], offs = [], len = 0;
      function push(x) { var b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); len += b.length; }
      function startObj(n) { offs[n] = len; push(n + ' 0 obj\n'); }
      push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
      startObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
      var kids = pages.map(function (pg, i) { return (3 + i * 3) + ' 0 R'; }).join(' ');
      startObj(2); push('<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>\nendobj\n');
      pages.forEach(function (pg, i) {
        var po = 3 + i * 3, co = po + 1, io = po + 2, pw = r1(pg.w * 0.75), ph = r1(pg.h * 0.75), content = 'q ' + pw + ' 0 0 ' + ph + ' 0 0 cm /Im0 Do Q';
        startObj(po); push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw + ' ' + ph + '] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>\nendobj\n');
        startObj(co); push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n');
        startObj(io); push('<< /Type /XObject /Subtype /Image /Width ' + pg.pxw + ' /Height ' + pg.pxh + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + pg.jpg.length + ' >>\nstream\n'); push(pg.jpg); push('\nendstream\nendobj\n');
      });
      var n = 3 + pages.length * 3, xref = len, x = 'xref\n0 ' + n + '\n0000000000 65535 f \n';
      for (var i = 1; i < n; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
      push(x + 'trailer\n<< /Size ' + n + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
      return new Blob(chunks, { type: 'application/pdf' });
    }
    async function exportPdf() {
      endEdit(true); toast(t('dd_pdf_busy'), 4000);
      try {
        var out = [], ref = host.watermark ? host.watermark.ref() : '';
        for (var i = 0; i < board.pages.length; i++) {
          var objs = board.pages[i].objs; await ensureImages(objs);
          var rg = pageRegion(objs, 1123, 794), sc = Math.min(2, 3200 / Math.max(rg.w, rg.h)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(rg.w * sc)); c.height = Math.max(1, Math.round(rg.h * sc));
          var cx = c.getContext('2d'); cx.scale(sc, sc); paint(cx, rg.w, rg.h, { x: -rg.x0, y: -rg.y0, z: 1 }, objs, board.bg, { exporting: true });
          if (ref) { cx.font = '11px ' + FONT; cx.fillStyle = board.bg === 'chalk' ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.35)'; cx.textAlign = 'right'; cx.textBaseline = 'bottom'; cx.fillText(ref, rg.w - 8, rg.h - 6); }
          var blob = await new Promise(function (res) { c.toBlob(res, 'image/jpeg', 0.9); });
          out.push({ w: rg.w, h: rg.h, pxw: c.width, pxh: c.height, jpg: new Uint8Array(await blob.arrayBuffer()) });
        }
        download(buildPdf(out), 'drawdeck-' + slug(board.name) + '.pdf');
      } catch (err) { console.warn('DrawDeck: PDF failed', err); toast(t('dd_img_fail')); }
    }
    function exportPng() {
      var b = contentBounds(page.objs), pad = 48, x0, y0, w, h;
      if (b) { x0 = b[0] - pad; y0 = b[1] - pad; w = b[2] - b[0] + pad * 2; h = b[3] - b[1] + pad * 2; } else { var tl = toWorld(0, 0); x0 = tl.x; y0 = tl.y; w = W / view.z; h = Hh / view.z; }
      var sc = Math.min(2, 4096 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      var cx = c.getContext('2d'); cx.scale(sc, sc); paint(cx, w, h, { x: -x0, y: -y0, z: 1 }, page.objs, board.bg, { exporting: true });
      var ref = host.watermark ? host.watermark.ref() : ''; if (ref) { cx.font = '11px ' + FONT; cx.fillStyle = board.bg === 'chalk' ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.35)'; cx.textAlign = 'right'; cx.textBaseline = 'bottom'; cx.fillText(ref, w - 8, h - 6); }
      c.toBlob(function (blob) { if (blob) download(blob, 'drawdeck-' + slug(board.name) + '-p' + (pi + 1) + '.png'); }, 'image/png');
    }
    /* ----- share this page with the class (StudentDeck's Shared Board widget) ----- */
    var sharing = false;
    function canShare() { return !!(host.share && host.stopShare && host.cloudClassId && host.cloudClassId()); }
    function shareBoard() {
      if (!canShare()) { toast(t('dd_share_need_class')); return; }
      var b = contentBounds(page.objs), pad = 48, x0, y0, w, h;
      if (b) { x0 = b[0] - pad; y0 = b[1] - pad; w = b[2] - b[0] + pad * 2; h = b[3] - b[1] + pad * 2; } else { var tl = toWorld(0, 0); x0 = tl.x; y0 = tl.y; w = W / view.z; h = Hh / view.z; }
      var sc = Math.min(2, 1600 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      var cx = c.getContext('2d'); cx.scale(sc, sc);
      cx.fillStyle = board.bg === 'chalk' ? '#1a2a1a' : '#ffffff'; cx.fillRect(0, 0, w, h);   // JPEG has no alpha; give it an opaque backdrop matching the board
      paint(cx, w, h, { x: -x0, y: -y0, z: 1 }, page.objs, board.bg, { exporting: true });
      var ref = host.watermark ? host.watermark.ref() : ''; if (ref) { cx.font = '11px ' + FONT; cx.fillStyle = board.bg === 'chalk' ? 'rgba(255,255,255,.45)' : 'rgba(0,0,0,.35)'; cx.textAlign = 'right'; cx.textBaseline = 'bottom'; cx.fillText(ref, w - 8, h - 6); }
      var dataUrl = c.toDataURL('image/jpeg', 0.82);
      if (dataUrl.length > 900000) { toast(t('dd_share_too_big')); return; }
      Promise.resolve(host.share(dataUrl)).then(function () { sharing = true; toast(t('dd_share_on')); renderChrome(); }, function () { toast(t('dd_share_fail')); });
    }
    function stopShareBoard() {
      Promise.resolve(host.stopShare()).then(function () { sharing = false; toast(t('dd_share_off')); renderChrome(); }, function () { toast(t('dd_share_fail')); });
    }
    /* ----- assign this page to students, who each draw their own answer (StudentDeck's Board Assignments widget) ----- */
    function canAssign() { return !!(host.assignBoard && host.cloudClassId && host.cloudClassId()); }
    function assignToStudents() {
      if (!canAssign()) { toast(t('dd_share_need_class')); return; }
      var title = prompt(t('dd_assign_ask'), board.name); if (!title || !title.trim()) return;
      var b = contentBounds(page.objs), pad = 48, x0, y0, w, h;
      if (b) { x0 = b[0] - pad; y0 = b[1] - pad; w = b[2] - b[0] + pad * 2; h = b[3] - b[1] + pad * 2; } else { var tl = toWorld(0, 0); x0 = tl.x; y0 = tl.y; w = W / view.z; h = Hh / view.z; }
      var sc = Math.min(2, 1600 / Math.max(w, h)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * sc)); c.height = Math.max(1, Math.round(h * sc));
      var cx = c.getContext('2d'); cx.scale(sc, sc);
      cx.fillStyle = board.bg === 'chalk' ? '#1a2a1a' : '#ffffff'; cx.fillRect(0, 0, w, h);
      paint(cx, w, h, { x: -x0, y: -y0, z: 1 }, page.objs, board.bg, { exporting: true });
      var dataUrl = c.toDataURL('image/jpeg', 0.82);
      if (dataUrl.length > 900000) { toast(t('dd_share_too_big')); return; }
      var tsc = Math.min(1, 300 / Math.max(c.width, c.height)), tc = document.createElement('canvas'); tc.width = Math.round(c.width * tsc); tc.height = Math.round(c.height * tsc);
      tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
      Promise.resolve(host.assignBoard(title.trim().slice(0, 80), tc.toDataURL('image/jpeg', 0.7), dataUrl))
        .then(function () { toast(t('dd_assign_ok')); }, function () { toast(t('dd_assign_fail')); });
    }
    function exportBoard() {
      var json = JSON.stringify({ drawdeck: 1, board: board }, null, 1), text = host.watermark ? host.watermark.stamp(json) : json;
      download(new Blob([text], { type: 'application/json' }), 'drawdeck-' + slug(board.name) + '.drawdeck.json');
    }
    function importBoard(file) {
      file.text().then(function (txt) {
        var data; try { data = JSON.parse(host.watermark ? host.watermark.strip(txt) : txt); } catch (e) { data = null; }
        var b = data && data.drawdeck && data.board; if (!b || !Array.isArray(b.pages) || !b.pages.length) { toast(t('dd_import_fail')); return; }
        b.id = uid(); b.updated = Date.now(); b.pages.forEach(function (p) { p.id = uid(); p.objs = Array.isArray(p.objs) ? p.objs : []; });
        boards.unshift(b); host.idb.put(STORE, b).catch(failSave); openBoard(b);
      }).catch(function () { toast(t('dd_import_fail')); });
    }
    function openOutline() {
      var rootId = null, by = byId(); sel.forEach(function (id) { var o = by.get(id); if (o && o.t === 'node') rootId = nodeRoot(page.objs, id); });
      var objs = rootId ? page.objs.filter(function (o) { return o.t === 'node' && descendants(page.objs, rootId).has(o.id); }) : page.objs;
      modalEl.innerHTML = '<div class="dd-card" role="dialog" aria-label="' + esc(t('dd_outline_h')) + '"><h3>' + esc(t('dd_outline_h')) + '</h3><p>' + esc(t('dd_outline_tip')) + '</p><textarea class="dd-outline-ta" spellcheck="false"></textarea><div class="dd-card-btns"><button type="button" class="dd-kind" data-act="outline-copy">' + esc(t('dd_outline_copy')) + '</button><button type="button" class="dd-kind on" data-act="outline-build">' + esc(t('dd_outline_build')) + '</button><button type="button" class="dd-kind" data-act="modal-close">' + esc(t('dd_close')) + '</button></div></div>';
      modalEl.hidden = false; var ta = modalEl.querySelector('textarea'); ta.value = outlineOf(objs); ta.focus();
    }
    function buildOutline(text) {
      text = host.watermark ? host.watermark.strip(text) : text;
      var b = contentBounds(page.objs), ox = b ? b[2] + 160 : 0, oy = b ? (b[1] + b[3]) / 2 : 0, nodes = parseOutline(text, ox, oy); if (!nodes.length) return;
      var roots = nodes.filter(function (n) { return !n.par; }), next = page.objs.concat(nodes), yy = oy;
      roots.forEach(function (r) { next = replaceObj(next, r.id, { x: ox, y: yy }); next = relayoutFor(next, r.id); var sub = descendants(next, r.id), mx = -1e9; next.forEach(function (o) { if (sub.has(o.id)) mx = Math.max(mx, o.y + o.h); }); yy = mx + 80; });
      sel = new Set(roots.map(function (r) { return r.id; })); change(next); closeModal(); setTimeout(fitView, 0);
    }

    /* ----- click handling (one delegate) ----- */
    rootEl.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-act]') : null;
      if (!el) { if (pop && !e.target.closest('.dd-pop')) closePop(); return; }
      var act = el.dataset.act, v = el.dataset.v;
      if (el.tagName === 'INPUT') return;
      if (el.classList.contains('dis') && (act === 'undo' || act === 'redo')) return;
      if (act !== 'boards' && act !== 'more' && act !== 'bgmenu' && act !== 'image' && act !== 'math' && act !== 'tpl') closePop();
      switch (act) {
        case 'tool': setTool(v); break;
        case 'mode': setMode(v); break;
        case 'undo': undo(); break; case 'redo': redo(); break;
        case 'zin': zoomAt(W / 2, Hh / 2, view.z * 1.2); break; case 'zout': zoomAt(W / 2, Hh / 2, view.z / 1.2); break;
        case 'zreset': zoomAt(W / 2, Hh / 2, 1); break; case 'zfit': fitView(); break;
        case 'color': applyColor(v); break;
        case 'size': applySize(+v); break;
        case 'shape': shapeKind = v; prefs.shape = v; savePrefs(); if (tool !== 'shape' && sel.size === 1) { var so = byId().get(Array.from(sel)[0]); if (so && so.t === 'shape' && !isLine(so) && FLOW_SHAPES.concat(DRAW_SHAPES).indexOf(v) > -1 && !isLine({ t: 'shape', k: v })) change(replaceObj(page.objs, so.id, { k: v })); } else tool = 'shape'; renderChrome(); need(); break;
        case 'layout': board.layout = v; prefs.layout = v; savePrefs(); change(layoutMind(page.objs, v)); renderChrome(); break;
        case 'topic': { var c = toWorld(W / 2, Hh / 2); var by = byId(), anyRoot = page.objs.filter(function (o) { return o.t === 'node'; }).length; if (anyRoot) { var b2 = contentBounds(page.objs); c = { x: b2[2] + 200, y: (b2[1] + b2[3]) / 2 }; } addRoot(c.x, c.y); break; }
        case 'child': addChild(); break; case 'sibling': addSibling(); break;
        case 'collapse': toggleCollapse(); break; case 'tidy': tidy(); break;
        case 'dup': dupSel(); break; case 'del': if (sel.size > 1) requireUnlock(deleteSel); else deleteSel(); break;
        case 'prevpage': gotoPage(pi - 1); break; case 'nextpage': gotoPage(pi + 1); break;
        case 'addpage': { var np = newPage(); board.pages.splice(pi + 1, 0, np); gotoPage(pi + 1); view = { x: W / 2, y: Hh / 2, z: 1 }; syncView(); dirty(); break; }
        case 'duppage': { var cp = JSON.parse(JSON.stringify(page)); cp.id = uid(); board.pages.splice(pi + 1, 0, cp); gotoPage(pi + 1); dirty(); break; }
        case 'delpage': if (board.pages.length > 1) requireUnlock(function () { if (confirm(t('dd_del_page_q'))) { board.pages.splice(pi, 1); hist.delete(page.id); gotoPage(Math.min(pi, board.pages.length - 1)); dirty(); } }); break;
        case 'clearpage': if (page.objs.length) requireUnlock(function () { if (confirm(t('dd_clear_q'))) { sel.clear(); change([]); } }); break;
        case 'boards': {
          if (pop === el) { closePop(); break; }
          openPop(el, '<div class="dd-menu">' + boards.map(function (b) { return menuItem('openboard', b.id, (b.id === board.id ? '✓ ' : '') + b.name); }).join('') + '<hr>' + menuItem('newboard', null, t('dd_new_board')) + menuItem('renameboard', null, t('dd_rename')) + menuItem('delboard', null, t('dd_del_board'), true) + '</div>'); break;
        }
        case 'openboard': { var nb = boards.find(function (b) { return b.id === v; }); if (nb) { persist(); pi = 0; openBoard(nb); } break; }
        case 'newboard': { persist(); var b3 = newBoard(); boards.unshift(b3); host.idb.put(STORE, b3).catch(failSave); pi = 0; openBoard(b3); break; }
        case 'renameboard': { var nn = prompt(t('dd_rename_ask'), board.name); if (nn && nn.trim()) { board.name = nn.trim().slice(0, 60); dirty(); renderChrome(); } break; }
        case 'delboard': requireUnlock(function () { if (confirm(t('dd_del_board_q'))) { var gone = board; host.idb.delete(STORE, gone.id).catch(failSave); boards = boards.filter(function (b) { return b.id !== gone.id; }); if (!boards.length) { var nb2 = newBoard(); boards.push(nb2); host.idb.put(STORE, nb2).catch(failSave); } pi = 0; openBoard(boards[0]); } }); break;
        case 'bgmenu': if (pop === el) { closePop(); break; } openPop(el, '<div class="dd-menu">' + BGS.map(function (b) { return menuItem('bg', b, (board.bg === b ? '✓ ' : '') + t('dd_bg_' + b)); }).join('') + '</div>'); break;
        case 'bg': { var was = board.bg; board.bg = v; if (v === 'chalk' && prefs.color === '#1a1a1a') prefs.color = '#ffffff'; else if (was === 'chalk' && v !== 'chalk' && prefs.color === '#ffffff') prefs.color = '#1a1a1a'; savePrefs(); dirty(); need(); renderChrome(); break; }
        case 'more': if (pop === el) { closePop(); break; } openPop(el, '<div class="dd-menu">' + menuItem('png', null, t('dd_png')) + menuItem('pdf', null, t('dd_pdf')) + (kidMode ? '' : menuItem('exportboard', null, t('dd_export')) + menuItem('importboard', null, t('dd_import'))) + (canShare() ? '<hr>' + (sharing ? menuItem('stopshare', null, t('dd_share_stop')) : menuItem('share', null, t('dd_share_start'))) : '') + (canAssign() ? '<hr>' + menuItem('assign', null, t('dd_assign_start')) : '') + '<hr>' + menuItem('duppage', null, t('dd_dup_page')) + menuItem('clearpage', null, t('dd_clear_page')) + menuItem('delpage', null, t('dd_del_page'), true) + '</div>'); break;
        case 'png': exportPng(); break; case 'pdf': exportPdf(); break;
        case 'share': shareBoard(); break; case 'stopshare': stopShareBoard(); break;
        case 'assign': assignToStudents(); break;
        case 'image': openImageMenu(el); break;
        case 'math': if (pop === el) { closePop(); break; } openMathMenu(el); break;
        case 'mathadd': addMath(v); break;
        case 'tpl': if (pop === el) { closePop(); break; } openTplMenu(el); break;
        case 'tplpick': applyTemplate(v); break;
        case 'props': if (sel.size === 1) openProps(Array.from(sel)[0]); break;
        case 'props-apply': applyProps(v); break;
        case 'imgcomputer': imgFileEl.value = ''; imgFileEl.click(); break;
        case 'imgfile': { var rec = imgFiles[+v]; if (rec) insertImage(rec.blob); break; }
        case 'erasemode': prefs.eraseParts = v === 'part'; savePrefs(); renderChrome(); break; case 'exportboard': exportBoard(); break; case 'importboard': fileEl.value = ''; fileEl.click(); break;
        case 'outline': openOutline(); break;
        case 'outline-copy': { var ta = modalEl.querySelector('textarea'), txt = host.watermark ? host.watermark.stamp(ta.value) : ta.value; (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast(t('dd_outline_copied')); }, function () { ta.select(); try { document.execCommand('copy'); toast(t('dd_outline_copied')); } catch (er) { } }); break; }
        case 'outline-build': buildOutline(modalEl.querySelector('textarea').value); break;
        case 'modal-close': closeModal(); break;
        case 'focus': setFocus(!focusMode); break;
        case 'fullscreen': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () { toast(t('doc_fullscreen_fail')); }); break;
      }
    });
    rootEl.addEventListener('input', function (e) { var el = e.target; if (el && el.dataset && el.dataset.act === 'customcolor') applyColor(el.value); });
    rootEl.addEventListener('change', function (e) { var el = e.target; if (el && el.dataset && el.dataset.act === 'fill') { prefs.fill = el.checked; savePrefs(); if (sel.size) { var next = page.objs; sel.forEach(function (id) { var o = byId().get(id); if (o && o.t === 'shape' && !isLine(o) && o.k !== 'note') next = replaceObj(next, id, { f: prefs.fill ? tint(o.c, '33') : null }); }); change(next); } } });
    fileEl.addEventListener('change', function () { if (fileEl.files && fileEl.files[0]) importBoard(fileEl.files[0]); });
    unfocusEl.addEventListener('click', function () { setFocus(false); });
    modalEl.addEventListener('click', function (e) { if (e.target === modalEl) closeModal(); });
    document.addEventListener('pointerdown', onDocDown, true);
    function onDocDown(e) { if (pop && !popEl.contains(e.target) && !(pop.contains && pop.contains(e.target))) closePop(); }

    /* ----- start ----- */
    var ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { resize(); }) : null; if (ro) ro.observe(stageEl); else window.addEventListener('resize', resize);
    resize();
    (async function init() {
      try { boards = (await host.idb.getAll(STORE)) || []; } catch (e) { boards = []; failSave(e); }
      if (!alive) return;
      boards = boards.filter(function (b) { return b && Array.isArray(b.pages) && b.pages.length; }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
      var b = boards.find(function (x) { return x.id === prefs.last; }) || boards[0];
      if (!b) { b = newBoard(); boards.push(b); try { host.idb.put(STORE, b).catch(failSave); } catch (e) { failSave(e); } }
      resize(); pi = 0; openBoard(b); setTimeout(function () { try { rootEl.focus({ preventScroll: true }); } catch (e) { } }, 50);
    })();

    return function cleanup() {
      alive = false; if (edit) { try { endEdit(true); } catch (e) { } }
      if (saveTimer) { clearTimeout(saveTimer); persist(); }
      document.removeEventListener('keydown', onKey); document.removeEventListener('keyup', onKeyUp); document.removeEventListener('paste', onPaste); document.removeEventListener('pointerdown', onDocDown, true);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      document.removeEventListener('fullscreenchange', syncFullscreen); window.removeEventListener('resize', syncFullscreen); document.body.classList.remove('dd-fs');
      if (rafId) cancelAnimationFrame(rafId);
      if (widgetEl) widgetEl.classList.remove('dd-widget');
    };
  }

  root.DrawDeck = { strings: S, mount: mount, _internals: { cutStroke: cutStroke, layoutMind: layoutMind, parseOutline: parseOutline, outlineOf: outlineOf, edgePoint: edgePoint, wrapText: wrapText } };
})(typeof window !== 'undefined' ? window : globalThis);
