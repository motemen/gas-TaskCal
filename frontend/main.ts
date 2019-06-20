import Vue from "vue";

type TaskObject = import("../src/Code").TaskObject;

type RPC = typeof import("../src/Code");

function callRPC<Name extends keyof RPC>(
  name: Name,
  ...args: Parameters<RPC[Name]>
): Promise<ReturnType<RPC[Name]>> {
  return new Promise<ReturnType<RPC[Name]>>((resolve, reject) => {
    google.script.run
      .withSuccessHandler(resolve)
      .withFailureHandler(reject)
      [name](...args);
  }).catch(err => {
    showSnackbar(`Server error: ${err}`);
    throw err;
  });
}

interface VueTasksData {
  tasks: TaskObject[];
  startEpochMillis: number | undefined;
  endEpochMillis: number | undefined;
  selectedEventId: string | null;
  loading: "past" | "future" | null;
}

interface VueTasksMethods {
  reload(): void;
}

const vueTasks = new Vue<VueTasksData, VueTasksMethods>({
  el: "#tasks",
  data: {
    tasks: [],
    startEpochMillis: undefined,
    endEpochMillis: undefined,
    selectedEventId: null,
    loading: null
  },
  created: function() {
    this.reload();
  },
  updated: function() {
    const checkboxes = document.querySelectorAll(".mdl-js-checkbox");
    for (let i = 0; i < checkboxes.length; i++) {
      const mc = (checkboxes[i] as any).MaterialCheckbox;
      if (mc) {
        mc.checkToggleState();
      }
    }

    componentHandler.upgradeDom();
  },
  methods: {
    async reload() {
      const { tasks, startEpochMillis, endEpochMillis } = await callRPC("listTasks", {
        startEpochMillis: this.startEpochMillis,
        endEpochMillis: this.endEpochMillis
      });
      this.tasks = tasks;
      this.startEpochMillis = startEpochMillis;
      this.endEpochMillis = endEpochMillis;
    },
    toDate(epochMillis: number) {
      return new Date(epochMillis).toLocaleDateString();
    },
    toDateTime(epochMillis: number) {
      return new Date(epochMillis).toLocaleString();
    },
    withDates(tasks: TaskObject[]) {
      const result: ({ isDate: true; date: string } | TaskObject)[] = [];
      if (tasks.length === 0) {
        return result;
      }

      let lastDate = new Date(tasks[0].startEpochMillis).toLocaleDateString();
      result.push({ isDate: true, date: lastDate });

      for (const task of tasks) {
        let date = new Date(task.startEpochMillis).toLocaleDateString();
        if (date !== lastDate) {
          result.push({ isDate: true, date });
          lastDate = date;
        }
        result.push(task);
      }

      return result;
    },
    async onToggleTask(task: TaskObject, event: Event) {
      const done = await callRPC(
        "toggleTaskDone",
        task.eventId,
        (event.target as HTMLInputElement).checked
      );
      console.log(done);
      task.done = done;
    },
    async onReschedule(task: TaskObject) {
      const result = await callRPC("rescheduleTask", task.eventId);
      await this.reload();
      showSnackbar("Rescheduled task", result.eventId);
    },
    async onCopy(task: TaskObject) {
      const result = await callRPC("copyTask", task.eventId);
      await this.reload();
      showSnackbar("Copied task", result.eventId);
    },
    eventPermalink(task: TaskObject) {
      const eventIdParts = task.eventId.split(/@/);
      return (
        "https://calendar.google.com/calendar/event?eid=" +
        encodeURIComponent(btoa(eventIdParts[0] + " " + task.calendarId))
      );
    },
    async loadPast() {
      this.loading = "past";
      const { tasks, startEpochMillis } = await callRPC("listTasks", {
        startEpochMillis: this.startEpochMillis,
        spanDays: -7
      });
      this.tasks = [...tasks, ...this.tasks];
      this.startEpochMillis = startEpochMillis;
      this.loading = null;
    },
    async loadFuture() {
      this.loading = "future";
      const { tasks, endEpochMillis } = await callRPC("listTasks", {
        startEpochMillis: this.endEpochMillis,
        spanDays: 7
      });
      this.tasks = [...this.tasks, ...tasks];
      this.endEpochMillis = endEpochMillis;
      this.loading = null;
    }
  }
});

function showSnackbar(message: string, eventId?: string) {
  (document.querySelector("#snackbar") as any).MaterialSnackbar.showSnackbar({
    message,
    timeout: 3000,
    actionHandler: eventId
      ? function() {
          location.hash = `event-${eventId}`;
        }
      : null,
    actionText: eventId ? "Show" : null
  });
}

const vueForm = new Vue({
  el: "#form",
  data: {
    isSubmitting: false
  },
  methods: {
    async createTask() {
      const form = this.$el as any;

      this.isSubmitting = true;

      try {
        const result = await callRPC(
          "createTask",
          form.elements.title.value,
          form.elements.minutes.value,
          form.elements.description.value
        );

        form.elements.title.value = "";
        form.elements.description.value = "";
        form.elements.minutes.value = 60;

        this.isSubmitting = false;

        await vueTasks.reload();

        showSnackbar("Created task", result.eventId);
      } catch (err) {
        console.error(err);
      } finally {
      }
    }
  }
});

window.onhashchange = function() {
  const m = /^#event-(.+)/.exec(location.hash);
  const eventId = m && m[1];
  vueTasks.selectedEventId = eventId;
};
