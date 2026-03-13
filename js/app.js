let starter_projects = []
let projects = []
let current_index = 0
let search_timer = null

const el_name = document.getElementById("card_name")
const el_ticker = document.getElementById("card_ticker")
const el_score = document.getElementById("card_score")
const el_chart = document.getElementById("btn_chart")
const el_badge_img = document.getElementById("card_badge_img")
const el_image = document.getElementById("card_image")
const el_tap_zone = document.getElementById("card_tap_zone")
const el_search_status = document.getElementById("search_status")
const el_feedback = document.getElementById("swipe_feedback")

const btn_fren = document.getElementById("btn_fren")
const btn_rug = document.getElementById("btn_rug")

const modal = document.getElementById("gate_modal")
const search_input = document.getElementById("search_input")

const swipe_stage = document.querySelector(".swipe_stage")
const badge_wrap = document.querySelector(".swipe_badge")

const VOTE_STORE_KEY = "frens_vote_store_v2"

function open_modal(){
  modal.classList.remove("hidden")
}

function close_modal(){
  modal.classList.add("hidden")
}

function bind_modal_close(){
  modal.addEventListener("click", (e) => {
    const target = e.target
    if (target && target.dataset && target.dataset.close === "true"){
      close_modal()
    }
  })
}

function get_fallback_image(name = "FRENS"){
  const label = encodeURIComponent(name)
  return `https://placehold.co/900x1200/EAF6FF/1F3A4D?text=${label}`
}

function set_search_status(text){
  if (el_search_status) el_search_status.textContent = text
}

function set_loading(is_loading){
  if (is_loading){
    search_input.classList.add("is_loading")
    if (swipe_stage) swipe_stage.classList.add("is_loading")
  } else {
    search_input.classList.remove("is_loading")
    if (swipe_stage) swipe_stage.classList.remove("is_loading")
  }
}

function get_store(){
  try{
    const raw = localStorage.getItem(VOTE_STORE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function set_store(store){
  localStorage.setItem(VOTE_STORE_KEY, JSON.stringify(store))
}

function get_project_key(project){
  return (
    project.project_id ||
    project.pair_address ||
    project.token_address ||
    project.chart_url ||
    `${project.name || "token"}_${project.ticker || "unknown"}`
  )
}

function get_vote_counts(project){
  const store = get_store()
  const key = get_project_key(project)
  const saved = store[key]

  const base_fren = Number(project.fren_votes || 0)
  const base_rug = Number(project.rug_votes || 0)

  return {
    fren_votes: saved?.fren_votes ?? base_fren,
    rug_votes: saved?.rug_votes ?? base_rug
  }
}

function save_vote(project, type){
  const store = get_store()
  const key = get_project_key(project)
  const current = get_vote_counts(project)

  if (type === "fren"){
    current.fren_votes += 1
  } else {
    current.rug_votes += 1
  }

  store[key] = current
  set_store(store)
}

function calculate_pack_score(fren_votes, rug_votes){
  const total = fren_votes + rug_votes
  if (total <= 0) return 0
  return Math.round((fren_votes / total) * 100)
}

function apply_badge_glow(label){
  if (!badge_wrap) return

  badge_wrap.classList.remove("gold_glow", "silver_glow", "diamond_glow")

  const tier = String(label || "").toLowerCase()

  if (tier.includes("diamond")){
    badge_wrap.classList.add("diamond_glow")
  } else if (tier.includes("silver")){
    badge_wrap.classList.add("silver_glow")
  } else {
    badge_wrap.classList.add("gold_glow")
  }
}

function show_feedback(type){
  if (!el_feedback) return

  el_feedback.classList.remove("is_fren", "is_rug")

  if (type === "fren"){
    el_feedback.classList.add("is_fren")
  } else {
    el_feedback.classList.add("is_rug")
  }

  setTimeout(() => {
    el_feedback.classList.remove("is_fren", "is_rug")
  }, 180)
}

function set_card(project){
  if (!project){
    el_name.textContent = "No projects found"
    el_ticker.textContent = ""
    el_score.textContent = "0"
    el_chart.href = "https://dexscreener.com/solana"
    el_badge_img.src = "images/badge-gold.png"
    el_badge_img.alt = "project badge"
    el_image.src = get_fallback_image("No Project")
    el_image.alt = "No project found"
    apply_badge_glow("gold")
    return
  }

  const votes = get_vote_counts(project)
  const pack_score = calculate_pack_score(votes.fren_votes, votes.rug_votes)

  el_name.textContent = project.name || "Untitled"
  el_ticker.textContent = project.ticker ? `$${project.ticker}` : ""
  el_score.textContent = String(pack_score)

  el_badge_img.src = project.badge_image || "images/badge-gold.png"
  el_badge_img.alt = project.badge_label ? `${project.badge_label} badge` : "project badge"

  el_chart.href = project.chart_url || "https://dexscreener.com/solana"

  const image_url = project.image_url || project.logo_url || get_fallback_image(project.name || "FRENS")
  el_image.src = image_url
  el_image.alt = project.name ? `${project.name} image` : "Project image"

  apply_badge_glow(project.badge_label || "gold")
}

function get_filtered_projects(){
  const q = (search_input.value || "").trim().toLowerCase()
  if (!q) return projects

  return projects.filter(project => {
    const name = (project.name || "").toLowerCase()
    const ticker = (project.ticker || "").toLowerCase()
    const badge = (project.badge_label || "").toLowerCase()
    return name.includes(q) || ticker.includes(q) || badge.includes(q)
  })
}

function show_current(){
  const filtered = get_filtered_projects()

  if (!filtered.length){
    set_card(null)
    return
  }

  if (current_index >= filtered.length) current_index = 0
  set_card(filtered[current_index])
}

function next_card(){
  const filtered = get_filtered_projects()

  if (!filtered.length){
    set_card(null)
    return
  }

  current_index += 1
  if (current_index >= filtered.length) current_index = 0
  set_card(filtered[current_index])
}

function get_current_project(){
  const filtered = get_filtered_projects()
  if (!filtered.length) return null
  if (current_index >= filtered.length) current_index = 0
  return filtered[current_index]
}

function animate_swipe(direction){
  const card = document.getElementById("project_card")
  if (!card) return

  card.style.transition = "transform 260ms ease, opacity 260ms ease"

  if (direction === "right"){
    card.style.transform = "translateX(120px) rotate(10deg)"
  } else {
    card.style.transform = "translateX(-120px) rotate(-10deg)"
  }

  card.style.opacity = "0.25"

  setTimeout(() => {
    card.style.transition = "none"
    card.style.transform = "translateX(0) rotate(0deg)"
    card.style.opacity = "1"
    next_card()
  }, 260)
}

function handle_vote(type){
  const project = get_current_project()
  if (!project) return

  save_vote(project, type)
  show_feedback(type)
  set_card(project)
  open_modal()
  animate_swipe(type === "fren" ? "right" : "left")
}

async function load_starter_projects(){
  try{
    const res = await fetch("data/projects.json", { cache: "no-store" })
    starter_projects = await res.json()
    projects = starter_projects.slice()
    current_index = 0
    set_search_status("Search any token to load it into the index.")
    show_current()
  } catch {
    starter_projects = []
    projects = []
    set_search_status("Could not load starter cards.")
    set_card(null)
  }
}

function map_pair_to_project(pair){
  const image_url =
    pair.info?.imageUrl ||
    pair.info?.openGraph ||
    pair.baseToken?.icon ||
    get_fallback_image(pair.baseToken?.name || "Token")

  return {
    project_id: pair.pairAddress,
    pair_address: pair.pairAddress,
    token_address: pair.baseToken?.address || "",
    name: pair.baseToken?.name || "Unknown Token",
    ticker: pair.baseToken?.symbol || "",
    image_url,
    chart_url: pair.url || "https://dexscreener.com/solana",
    badge_label: "silver",
    badge_image: "images/badge-silver.png",
    fren_votes: 0,
    rug_votes: 0
  }
}

async function search_live_tokens(query){
  const trimmed = (query || "").trim()

  if (!trimmed){
    projects = starter_projects.slice()
    current_index = 0
    set_search_status("Search any token to load it into the index.")
    show_current()
    return
  }

  set_loading(true)
  set_search_status(`Searching for "${trimmed}"...`)

  try{
    const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(trimmed)}`
    const res = await fetch(url)
    const data = await res.json()

    const pairs = Array.isArray(data.pairs) ? data.pairs : []

    const solana_pairs = pairs.filter(pair => {
      return String(pair.chainId || "").toLowerCase() === "solana"
    })

    projects = solana_pairs.slice(0, 20).map(map_pair_to_project)
    current_index = 0

    if (!projects.length){
      set_search_status(`No Solana tokens found for "${trimmed}".`)
      set_card(null)
    } else {
      set_search_status(`Loaded ${projects.length} token${projects.length === 1 ? "" : "s"} for "${trimmed}".`)
      show_current()
    }
  } catch {
    set_search_status("Search failed. Please try again.")
    set_card(null)
  } finally {
    set_loading(false)
  }
}

function bind_events(){
  btn_fren.addEventListener("click", () => {
    handle_vote("fren")
  })

  btn_rug.addEventListener("click", () => {
    handle_vote("rug")
  })

  if (el_tap_zone){
    el_tap_zone.addEventListener("click", () => {
      open_modal()
    })
  }

  const btn_create = document.getElementById("btn_create_account")
  if (btn_create){
    btn_create.addEventListener("click", () => {
      close_modal()
      alert("phase 3 will add accounts. for now you can browse freely.")
    })
  }

  search_input.addEventListener("input", () => {
    const value = search_input.value || ""
    clearTimeout(search_timer)

    search_timer = setTimeout(() => {
      search_live_tokens(value)
    }, 350)
  })

  let touch_start_x = 0
  let touch_end_x = 0

  const card = document.getElementById("project_card")
  if (card){
    card.addEventListener("touchstart", (e) => {
      touch_start_x = e.changedTouches[0].clientX
    })

    card.addEventListener("touchend", (e) => {
      touch_end_x = e.changedTouches[0].clientX
      const diff = touch_end_x - touch_start_x

      if (diff > 60){
        handle_vote("fren")
      } else if (diff < -60){
        handle_vote("rug")
      }
    })
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close_modal()
    if (e.key === "ArrowRight"){
      handle_vote("fren")
    }
    if (e.key === "ArrowLeft"){
      handle_vote("rug")
    }
  })
}

const sections = document.querySelectorAll(".section")
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("in_view")
  })
}, { threshold: 0.12 })

sections.forEach(section => io.observe(section))
bind_modal_close()
bind_events()
load_starter_projects()
