<template>
  <div class="route-view-cache-host">
    <!--
      Keep this wrapper mounted even while visiting a non-cached route. If the
      keep-alive node itself is conditionally removed, Vue discards every page
      stored inside it and returning from Settings/Marketplace looks like a
      full refresh.
    -->
    <keep-alive :max="maxCachedPages">
      <router-view
        v-if="shouldKeepAlive"
        :key="cachedRouteKey"
      />
    </keep-alive>

    <router-view
      v-if="!shouldKeepAlive"
      :key="liveRouteKey"
    />
  </div>
</template>

<script>
export default {
  name: 'RouteView',
  props: {
    keepAlive: {
      type: Boolean,
      default: false
    },
    maxCachedPages: {
      type: Number,
      default: 12
    }
  },
  computed: {
    shouldKeepAlive () {
      const routeMeta = this.$route.meta || {}
      const multiTab = Boolean(this.$store && this.$store.getters && this.$store.getters.multiTab)
      return Boolean(this.keepAlive || multiTab || routeMeta.keepAlive)
    },
    // Query-string changes should update the existing page instead of wiping
    // its editor/chat/chart state. Different named pages still get their own
    // cache entries.
    cachedRouteKey () {
      return this.$route.name || this.$route.path
    },
    // Non-cached routes retain the previous fullPath behaviour and are rebuilt
    // when their params/query change.
    liveRouteKey () {
      return this.$route.fullPath || this.$route.path
    }
  }
}
</script>

<style scoped>
.route-view-cache-host {
  width: 100%;
  min-width: 0;
}
</style>
