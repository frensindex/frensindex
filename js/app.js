const supabaseUrl = "https://gkqskrhxrfvexxrzcfan.supabase.co"
const supabaseKey = "sb_publishable_ZJjq7WefqtMN7bLEF6Yffw_kmYpjC6V"

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey)

let starter_projects = []
let projects = []
let current_index = 0
let search_timer = null
let seen_pair_addresses = new Set()
let discovery_loading = false

const DISCOVERY_BATCH_SIZE = 24
const MIN_MARKET_CAP = 30000
const MAX_AGE_DAYS = 7
const DAILY_SWIPE_LIMIT_GUEST = 8
const ONE_DAY_MS = 24 * 60 * 60 * 1000
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
const btn_skip = document.getElementById("btn_skip")

const modal = document.getElementById("gate_modal")
const search_input = document.getElementById("search_input")

const swipe_stage = document.querySelector(".swipe_stage")
const badge_wrap = document.querySelector(".swipe_badge")

const VOTE_STORE_KEY = "frens_vote_store_v2"

function open_modal(){
  if (!modal) return
  modal.classList.remove("hidden")
}

function close_modal(){
  if (!modal) return
  modal.classList.add("hidden")
}
function bind_modal_close(){
  if (!modal) return

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
    if (search_input) search_input.classList.add("is_loading")
    if (swipe_stage) swipe_stage.classList.add("is_loading")
  } else {
    if (search_input) search_input.classList.remove("is_loading")
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
function get_now(){
  return Date.now()
}
async function get_logged_in_user(){
  try{
    const { data, error } = await supabaseClient.auth.getUser()

    if (error) return null
    return data?.user || null
  } catch {
    return null
  }
}
function is_same_day_vote(timestamp){
  if (!timestamp) return false
  return (get_now() - Number(timestamp)) < ONE_DAY_MS
}

function has_voted_today(project){
  const store = get_store()
  const key = get_project_key(project)
  const saved = store[key]

  if (!saved?.last_voted_at) return false

  return is_same_day_vote(saved.last_voted_at)
}

function get_guest_swipe_count_today(){
  const store = get_store()
  const values = Object.values(store)

  return values.filter(entry => {
    return entry?.last_voted_at && is_same_day_vote(entry.last_voted_at)
  }).length
}

function has_guest_swipes_remaining(){
  return get_guest_swipe_count_today() < DAILY_SWIPE_LIMIT_GUEST
}

function can_vote_today(project){
  return !has_voted_today(project) && has_guest_swipes_remaining()
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
    rug_votes: saved?.rug_votes ?? base_rug,
    last_vote_type: saved?.last_vote_type ?? null,
    last_voted_at: saved?.last_voted_at ?? null
  }
}

function save_vote(project, type){
  if (!can_vote_today(project)){
    return false
  }

  const store = get_store()
  const key = get_project_key(project)
  const current = get_vote_counts(project)

  if (type === "fren"){
    current.fren_votes += 1
  } else {
    current.rug_votes += 1
  }

  store[key] = {
    fren_votes: current.fren_votes,
    rug_votes: current.rug_votes,
    last_vote_type: type,
    last_voted_at: get_now()
  }

  set_store(store)
  return true
}

async function submit_vote_to_db(project, type){
  try{
    const { error } = await supabaseClient
      .from("votes")
      .insert({
        project_id: project.project_id || project.pair_address || project.token_address || project.name,
        pair_address: project.pair_address || null,
        token_address: project.token_address || null,
        vote_type: type
      })

    if (error){
      console.error("vote insert failed", error)
    }
  } catch(err){
    console.error("vote insert failed", err)
  }
}
function save_skip(project){
  if (!has_guest_swipes_remaining() || has_voted_today(project)){
    return false
  }

  const store = get_store()
  const key = get_project_key(project)
  const current = get_vote_counts(project)

  store[key] = {
    fren_votes: current.fren_votes,
    rug_votes: current.rug_votes,
    last_vote_type: "skip",
    last_voted_at: get_now()
  }

  set_store(store)
  return true
}

async function handle_skip(){
  const project = get_current_project()
  if (!project) return

  if (project.is_system_card){
    animate_swipe("left")
    return
  }

  const user = await get_logged_in_user()
  const is_logged_in = !!user

  if (!is_logged_in && !has_guest_swipes_remaining()){
    alert("You’ve used all guest swipes for today. Create an account to unlock more.")
    return
  }

  if (!is_logged_in && has_voted_today(project)){
    alert("You already acted on this project today.")
    return
  }

  if (!is_logged_in){
    const saved = save_skip(project)

    if (!saved){
      alert("You already acted on this project today.")
      return
    }
  }

  animate_swipe("left")
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
  const card = document.getElementById("project_card")

  if (card){
    card.classList.remove("system_card")
  }

  el_chart.style.display = ""
  el_badge_img.style.display = ""
  el_ticker.style.display = ""

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

  if (project.is_system_card){
    if (card){
      card.classList.add("system_card")
    }

    el_name.textContent = project.name || ""
    el_ticker.textContent = project.ticker || ""
    el_score.textContent = ""
    el_chart.href = "#"
    el_badge_img.src = ""
    el_badge_img.alt = ""
    el_image.src = project.image_url || get_fallback_image(project.name || "System Card")
    el_image.alt = project.name || "System card"

    el_chart.style.display = "none"
    el_badge_img.style.display = "none"

    if (!project.ticker){
      el_ticker.style.display = "none"
    }

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

async function next_card(){
  const filtered = get_filtered_projects()

  if (!filtered.length){
    set_card(null)
    return
  }

  current_index += 1

  if (current_index >= filtered.length){
    const q = (search_input.value || "").trim()

    if (!q){
      await ensure_discovery_buffer()
    }
  }

  const updated_filtered = get_filtered_projects()

  if (!updated_filtered.length){
    set_card(null)
    return
  }

  if (current_index >= updated_filtered.length){
    current_index = 0
  }

  set_card(updated_filtered[current_index])

  if (!(search_input.value || "").trim()){
    ensure_discovery_buffer()
  }
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

  setTimeout(async () => {
    card.style.transition = "none"
    card.style.transform = "translateX(0) rotate(0deg)"
    card.style.opacity = "1"
    await next_card()
  }, 260)
}

async function handle_vote(type){
  const project = get_current_project()
  if (!project) return

  if (project.is_system_card){
    animate_swipe(type === "fren" ? "right" : "left")
    return
  }

  const user = await get_logged_in_user()
  const is_logged_in = !!user

  if (!is_logged_in && !has_guest_swipes_remaining()){
    alert("You’ve used all guest swipes for today. Create an account to unlock more.")
    return
  }

  if (!is_logged_in && has_voted_today(project)){
    alert("You already voted on this project today.")
    return
  }

  if (!is_logged_in){
    const saved = save_vote(project, type)

    if (!saved){
      alert("You already voted on this project today.")
      return
    }
  }

  await submit_vote_to_db(project, type)

  show_feedback(type)
  set_card(project)
  animate_swipe(type === "fren" ? "right" : "left")
}
async function load_starter_projects(){
  try{
    const res = await fetch("data/projects.json", { cache: "no-store" })
    starter_projects = await res.json()

    starter_projects.forEach(project => {
      if (project.pair_address){
        seen_pair_addresses.add(project.pair_address)
      }
    })

    const featured_sorted = [...starter_projects]
      .filter(project => !has_voted_today(project))
      .sort((a, b) => {
        return Number(a.promo_rank || 999) - Number(b.promo_rank || 999)
      })

    projects = featured_sorted
    current_index = 0
    const current_user = await get_logged_in_user()

if (current_user){
  const username =
    current_user.user_metadata?.preferred_username ||
    current_user.user_metadata?.user_name ||
    current_user.user_metadata?.name ||
    "user"

  set_search_status(`Signed in as @${username}`)
} else {
  set_search_status(`Guest mode: ${DAILY_SWIPE_LIMIT_GUEST} swipes per day. Search any token to load it into the index.`)
}

    if (!projects.length){
      await ensure_discovery_buffer()
    }

    show_current()

    if (projects.length){
      ensure_discovery_buffer()
    }
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
    pair.info?.header ||
    pair.info?.openGraph ||
    pair.baseToken?.icon ||
    get_fallback_image(pair.baseToken?.name || "Token")

  return {
    project_id: pair.pairAddress,
    pair_address: pair.pairAddress,
    chain_id: pair.chainId || "solana",
    token_address: pair.baseToken?.address || "",
    name: pair.baseToken?.name || "Unknown Token",
    ticker: pair.baseToken?.symbol || "",
    image_url,
    chart_url: pair.url || "https://dexscreener.com/solana",
    badge_label: "silver",
    badge_image: "images/badge-silver.png",
    fren_votes: 0,
    rug_votes: 0,
    market_cap: Number(pair.marketCap || pair.fdv || 0),
    pair_created_at: Number(pair.pairCreatedAt || 0)
  }
}
function shuffle_array(arr){
  const copy = [...arr]

  for (let i = copy.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1))
    const temp = copy[i]
    copy[i] = copy[j]
    copy[j] = temp
  }

  return copy
}

function is_recent_pair(pair_created_at){
  if (!pair_created_at) return false

  const age_ms = Date.now() - Number(pair_created_at)
  const max_age_ms = MAX_AGE_DAYS * 24 * 60 * 60 * 1000

  return age_ms <= max_age_ms
}

function qualifies_for_discovery(pair){

  const market_cap = Number(pair.marketCap || pair.fdv || 0)
  const recent = is_recent_pair(pair.pairCreatedAt)

  const liquidity = Number(pair.liquidity?.usd || 0)
  const volume_24h = Number(pair.volume?.h24 || 0)
  const price_change = Number(pair.priceChange?.h24 || 0)

  const liquidity_ok = liquidity >= 10000
  const volume_ok = volume_24h >= 5000
  const price_ok = price_change > -80

  return (
    (market_cap >= MIN_MARKET_CAP || recent)
    && liquidity_ok
    && volume_ok
    && price_ok
  )
}
async function fetch_discovery_projects(){
  if (discovery_loading) return []

  discovery_loading = true

  try{
    const profiles_res = await fetch("https://api.dexscreener.com/token-profiles/latest/v1")
    const profiles_data = await profiles_res.json()

    const solana_profiles = Array.isArray(profiles_data)
      ? profiles_data.filter(item => String(item.chainId || "").toLowerCase() === "solana")
      : []

    const token_addresses = solana_profiles
      .map(item => item.tokenAddress)
      .filter(Boolean)

    if (!token_addresses.length) return []

    const shuffled_addresses = shuffle_array(token_addresses).slice(0, 30)

    const tokens_url = `https://api.dexscreener.com/tokens/v1/solana/${shuffled_addresses.join(",")}`
    const pairs_res = await fetch(tokens_url)
    const pairs_data = await pairs_res.json()

    const pairs = Array.isArray(pairs_data) ? pairs_data : []

    const filtered_pairs = pairs.filter(pair => {
  const chain_ok = String(pair.chainId || "").toLowerCase() === "solana"
  const not_seen = !seen_pair_addresses.has(pair.pairAddress)

  const project_like = {
    project_id: pair.pairAddress,
    pair_address: pair.pairAddress,
    token_address: pair.baseToken?.address || "",
    chart_url: pair.url || ""
  }

  const not_voted_today = !has_voted_today(project_like)

  return chain_ok && not_seen && not_voted_today && qualifies_for_discovery(pair)
})

    const shuffled_pairs = shuffle_array(filtered_pairs)

    const mapped = shuffled_pairs.slice(0, DISCOVERY_BATCH_SIZE).map(map_pair_to_project)

    mapped.forEach(project => {
      if (project.pair_address){
        seen_pair_addresses.add(project.pair_address)
      }
    })

    return mapped
  } catch (err){
    console.error("discovery fetch failed", err)
    return []
  } finally {
    discovery_loading = false
  }
}
async function ensure_discovery_buffer(){
  const q = (search_input.value || "").trim()
  if (q) return

  const remaining = projects.length - current_index - 1

  if (remaining > 5) return

  const discovery_projects = await fetch_discovery_projects()

  if (!discovery_projects.length) return

  projects = [...projects, ...discovery_projects]
}

function looks_like_solana_address(value){
  const trimmed = String(value || "").trim()
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)
}

async function fetch_pairs_from_dexscreener(query){
  const trimmed = String(query || "").trim()

  if (!trimmed) return []

  if (looks_like_solana_address(trimmed)){
    const url = `https://api.dexscreener.com/token-pairs/v1/solana/${encodeURIComponent(trimmed)}`
    const res = await fetch(url)
    const data = await res.json()
    return Array.isArray(data) ? data : []
  }

  const url = `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(trimmed)}`
  const res = await fetch(url)
  const data = await res.json()
  return Array.isArray(data.pairs) ? data.pairs : []
}

async function search_live_tokens(query){
  const trimmed = (query || "").trim()

  if (!trimmed){
    projects = [...starter_projects]
      .filter(project => !has_voted_today(project))
      .sort((a, b) => {
        return Number(a.promo_rank || 999) - Number(b.promo_rank || 999)
      })

    current_index = 0
    const current_user = await get_logged_in_user()

if (current_user){
  const username =
    current_user.user_metadata?.preferred_username ||
    current_user.user_metadata?.user_name ||
    current_user.user_metadata?.name ||
    "user"

  set_search_status(`Signed in as @${username}`)
} else {
  set_search_status(`Guest mode: ${DAILY_SWIPE_LIMIT_GUEST} swipes per day. Search any token to load it into the index.`)
}

    if (!projects.length){
      await ensure_discovery_buffer()
    }

    show_current()

    if (projects.length){
      ensure_discovery_buffer()
    }

    return
  }

  set_loading(true)
  set_search_status(`Searching for "${trimmed}"...`)

  try{
    const pairs = await fetch_pairs_from_dexscreener(trimmed)

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
  } catch (err){
    console.error(err)
    set_search_status("Search failed. Please try again.")
    set_card(null)
  } finally {
    set_loading(false)
  }
}
const sections = document.querySelectorAll(".section")
const io = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("in_view")
  })
}, { threshold: 0.12 })

sections.forEach(section => io.observe(section))

async function sign_in_with_x(){
  try{
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "twitter",
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    })

    if (error){
      console.error("x sign in failed", error)
      alert("X sign in failed. Please try again.")
      return
    }
  } catch(err){
    console.error("x sign in failed", err)
    alert("X sign in failed. Please try again.")
  }
}

async function check_auth_session(){
  try{
    const { data, error } = await supabaseClient.auth.getUser()

    if (error){
      console.error("auth check failed", error)
      return
    }

    const user = data?.user || null
    const btn_create = document.getElementById("btn_create_account")

    if (user){
      const username =
        user.user_metadata?.preferred_username ||
        user.user_metadata?.user_name ||
        user.user_metadata?.name ||
        "user"

      set_search_status(`Signed in as @${username}`)
      console.log("logged in user", user)

      if (btn_create){
        btn_create.classList.add("is_hidden")
      }
    } else {
      if (btn_create){
        btn_create.classList.remove("is_hidden")
      }
    }
  } catch(err){
    console.error("auth check failed", err)
  }
}

function bind_events(){
  if (btn_fren){
    btn_fren.addEventListener("click", () => {
      handle_vote("fren")
    })
  }

  if (btn_rug){
    btn_rug.addEventListener("click", () => {
      handle_vote("rug")
    })
  }

  if (btn_skip){
    btn_skip.addEventListener("click", () => {
      handle_skip()
    })
  }

  if (el_tap_zone){
    el_tap_zone.addEventListener("click", () => {
    })
  }

  const btn_create = document.getElementById("btn_create_account")
  if (btn_create){
    btn_create.addEventListener("click", async () => {
      await sign_in_with_x()
    })
  }

  const close_targets = document.querySelectorAll('[data_close="true"]')
  close_targets.forEach(el => {
    el.addEventListener("click", () => {
      close_modal()
    })
  })

  if (search_input){
    search_input.addEventListener("input", () => {
      const value = search_input.value || ""
      clearTimeout(search_timer)

      search_timer = setTimeout(() => {
        search_live_tokens(value)
      }, 350)
    })
  }

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
    if (e.key === "ArrowDown"){
      handle_skip()
    }
  })
}
bind_modal_close()
bind_events()
load_starter_projects()
check_auth_session()
