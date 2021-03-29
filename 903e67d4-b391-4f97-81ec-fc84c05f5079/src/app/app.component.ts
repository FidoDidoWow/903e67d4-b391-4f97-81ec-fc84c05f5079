import { Component, OnInit, ChangeDetectorRef, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { Class, Student, Absence, Period, Leave } from "./help-class";
import { AppService } from "./app.service";
import * as rx from 'rxjs/Rx';



@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  selClass: Class;
  currAbs: Absence;
  classes: Class[] = new Array<Class>();
  /**可設定的假別 */
  absences: Absence[] = new Array<Absence>();
  /**全部的假別 */
  allAbsences: Absence[] = new Array<Absence>();
  clearAbs: Absence = new Absence(null, null);
  /**節次 */
  periods: Period[] = new Array<Period>();
  periodMap: Map<string, Period> = new Map<string, Period>();
  periodPermissionMap: Map<string, Period> = new Map<string, Period>();

  allowed = false;;

  // 學校設定的假日
  holidayList = new Array<string>();

  // 假如支援跨天點名，可以允許的日期
  allowedDaysList = new Array<string>();

  /**檢查連續的假別 */
  checkAbsences: Absence[] = new Array<Absence>();

  students: Student[] = new Array<Student>();
  classSubject$: rx.Subject<Class> = new rx.Subject();
  /**今天該班點名狀態 */
  completed: boolean;
  /**允許跨日設定 */
  canCrossDate = false;

  // 跨日前後 預設2天
  beforeDates = 2;
  afterDates = 2;

  currentDate: Date = new Date(new Date().toDateString());
  todayDate: Date = new Date(new Date().toDateString());

  quickSelectDate: Date[] = [];

  inputDate: string;

  Timer: any;
  maxTime = 300000;
  lastTime: Date = new Date();

  constructor(private appService: AppService, private change: ChangeDetectorRef) {

    this.Timer = setTimeout(this.showAlert, this.maxTime);
    let now = new Date();
  }

  /**
 * 重設 timeOut
 */
  reset() {
    clearTimeout(this.Timer);
    this.Timer = setTimeout(this.showAlert, this.maxTime);
  }

  showAlert() {
    alert('閒置超過5分鐘，將重新載入....');
    location.reload();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(e: any) {
    // console.log('this.maxTime ', this.maxTime);
    // console.log('this.diff ', dayjs.duration(Math.abs(this.lastTime.diff(now))).asSeconds());
    // if (this.maxTime < dayjs.duration(Math.abs(this.lastTime.diff(now))).asSeconds()) {
    //   alert('hahah');
    // }
    this.reset();
  }

  ngOnInit() {
    // 預設值
    this.currAbs = this.clearAbs;
    this.completed = false;
    this.inputDate = this.getDateString(this.currentDate);

    this.quickSelectDate = [];
    [1, 2, 3, 4, 5].forEach(i => {
      var qdate = new Date(this.currentDate);
      qdate.setDate(qdate.getDate() - qdate.getDay() + i);
      this.quickSelectDate.push(qdate);
    });

    // 取得假別、節次、老師帶班
    rx.Observable.combineLatest(
      this.appService.getConfig(),
      this.appService.getSCHOOLHOLIDAYConfig(),
      this.appService.getAbsences(),
      this.appService.getPeriods(),
      this.appService.getMyClass(), (config, SCHOOLHOLIDAYConfig, x, y, z) => {
        this.canCrossDate = config.crossDate;
        this.holidayList = SCHOOLHOLIDAYConfig.HolidayList;

        this.beforeDates = config.BeforeDates;
        this.afterDates = config.AfterDates;

        // 比對設定檔，為 true 的假別才顯示
        if (config.absenceNames.length) {
          const absencesList: Absence[] = [];
          for (const item of x) {
            if (config.absenceNames.indexOf(item.name) !== -1) {
              absencesList.push(item);
            }
          }
          this.absences = absencesList;
        } else {
          this.absences = x;
        }

        // 比對設定檔，為 true 的假別才列入 重覆檢查(目前限1)
        if (config.checkAbsenceNames.length) {
          const checkAbsences: Absence[] = [];
          for (const item of x) {
            if (config.checkAbsenceNames.indexOf(item.name) !== -1) {
              checkAbsences.push(item);
            }
          }
          this.checkAbsences = checkAbsences;
        } else {
          this.checkAbsences = x;
        }

        this.allAbsences = x;
        this.periods = y;
        y.forEach((p) => {
          p.permission = "一般";
          if (config.periodPermissionMap.size) {
            config.periodPermissionMap.forEach((item, key) => {
              if (key === p.name) {
                p.permission = config.periodPermissionMap.get(key);
              }
            });
            this.periodMap.set(p.name, p);
          }
          else {
            this.periodMap.set(p.name, p);
          }
        });

        this.periods = this.periods.filter(period => period.permission !== "隱藏");

        this.classes = z;
      })
      .subscribe(() => {
        // 全部取回後，進行處理
        if (this.classes && this.classes.length) {
          // 指定目前班級為第一個班級
          this.selClass = this.classes[0];
          // 訂閱班級異動
          this.classSubject$.subscribe((c) => {
            rx.Observable.combineLatest(
              this.appService.getClassStudentsLeave(c, this.getDateString(this.currentDate), this.absences), this.appService.getRollcallState(c), (studs, complete) => {
                this.students = studs;
                this.completed = complete;
              })
              .subscribe();
          });
          // 切換班級
          this.toggleClassDate();
        }

        // 處理學校設定假日非上課、 開放前後幾天點名，
        // 當天        
        if (!this.holidayList.includes(this.getDateString(this.todayDate))) {
          this.allowedDaysList.push(this.getDateString(this.todayDate));
        }

        // 前幾天
        for (var i = 1; i <= this.beforeDates; i++) {

          let allowedDay = this.getDateString(new Date(new Date().setDate(new Date(new Date().toDateString()).getDate() - i)));

          if (!this.holidayList.includes(allowedDay) && !this.allowedDaysList.includes(allowedDay)) {
            this.allowedDaysList.push(allowedDay)
          }
          else {
            for (var ii = 1; ii <= 100; ii++) {
              let allowedDay2 = this.getDateString(new Date(new Date().setDate(new Date(new Date().toDateString()).getDate() - ii)));

              if (!this.holidayList.includes(allowedDay2) && !this.allowedDaysList.includes(allowedDay2)) {
                this.allowedDaysList.push(allowedDay2);
                break;
              }
            }
          }
        }

        // 後幾天
        for (var i = 1; i <= this.beforeDates; i++) {

          let allowedDay = this.getDateString(new Date(new Date().setDate(new Date(new Date().toDateString()).getDate() + i)));

          if (!this.holidayList.includes(allowedDay) && !this.allowedDaysList.includes(allowedDay)) {
            this.allowedDaysList.push(allowedDay)
          }
          else {
            for (var ii = 1; ii <= 100; ii++) {
              let allowedDay2 = this.getDateString(new Date(new Date().setDate(new Date(new Date().toDateString()).getDate() + ii)));

              if (!this.holidayList.includes(allowedDay2) && !this.allowedDaysList.includes(allowedDay2)) {
                this.allowedDaysList.push(allowedDay2);
                break;
              }
            }
          }
        }


      });





  }
  getDateString(dateTime: Date): string {
    return dateTime.getFullYear() + "/" + (dateTime.getMonth() + 1) + "/" + dateTime.getDate();
  }

  getDisplayDateString(dateTime: Date): string {
    return (
      (dateTime.getMonth() <= 8 ? "0" : "") + (dateTime.getMonth() + 1)
      + "/" + (dateTime.getDate() <= 9 ? "0" : "") + + dateTime.getDate()
      + " (" + ["日", "一", "二", "三", "四", "五", "六"][dateTime.getDay()] + ")"
    );
  }

  checkDate(input: string) {
    var d = Date.parse(input);
    if (d) {
      this.setCurrentDate(new Date(d));
    }
    else {
      this.inputDate = input;
    }
  }

  setCurrentDate(target: Date, shift?: number) {
    target = new Date(target);
    if (shift) {
      target.setDate(target.getDate() + shift);
    }
    if (this.getDateString(this.currentDate) != this.getDateString(target)) {
      this.currentDate = target;
      this.toggleClassDate();
    }
    this.inputDate = this.getDateString(this.currentDate);

    this.quickSelectDate = [];
    [1, 2, 3, 4, 5].forEach(i => {
      var qdate = new Date(this.currentDate);
      qdate.setDate(qdate.getDate() - qdate.getDay() + i);
      this.quickSelectDate.push(qdate);
    });



  }

  /**切換班級或缺曠日期，取得「該日學生缺曠」、「點名完成」狀態 */
  toggleClassDate(targetClass?: Class) {
    if (targetClass)
      this.selClass = targetClass;
    if (this.selClass) {
      this.classSubject$.next(this.selClass);
    }
  }


  /**假別簡稱 */
  toShort(name: string): string {
    for (let n of this.allAbsences) {
      if (n.name == name) {
        return n.abbreviation;
      }
    }

    return '';
  }

  /**設定全部學生該節次統一假別 */
  setAllStudentsAbs(period: Period) {
    if (period && this.currAbs) {
      this.students.forEach((stu) => {
        if (period.permission === "一般") {
          stu.setAbsence(period.name, this.currAbs.name);
        }
      });
    }
  }

  /**設定單一學生所有節次統一假別 */
  setStudentAllPeriodAbs(stu) {
    if (stu && this.currAbs) {
      this.periods.forEach((period: Period) => {
        if (period.permission === "一般") {
          stu.setAbsence(period.name, this.currAbs.name);
        }
      });
    }
  }

  /**設定單一學生單一節次假別 */
  setStudentPeroidAbs(stu, period) {
    if (stu && period && this.currAbs) {
      if (stu.leaveList.has(period.name)) {
        // 與上次相同即清除
        if (stu.leaveList.get(period.name).absName == this.currAbs.name) {
          if (period.permission === "一般" || period.permission === "手動") {
            stu.setAbsence(period.name, this.clearAbs.name);
          }
        }
        else {
          if (period.permission === "一般" || period.permission === "手動") {
            stu.setAbsence(period.name, this.currAbs.name);
          }
        }
      } else {
        if (period.permission === "一般" || period.permission === "手動") {
          stu.setAbsence(period.name, this.currAbs.name);
        }
      }
    }
  }

  /**儲存點名結果 */
  saveData() {
    let data = [];
    let hasWarnData = false;;
    let warnMsg = "提醒，本次新增點名下列個別學生具有連堂【" + this.checkAbsences.map(x => x.name).join(",") + "】紀錄，請確認點名是否正確後存檔 :    ";
    let warnStudents = [];

    // 非在開放天 白名單，不給點名存檔
    if (this.allowedDaysList.includes(this.getDateString(this.currentDate))) {
      this.allowed = true;
    }
    else {
      this.allowed = false;
    }

    // 非在正確日期，不開放點名
    if (!this.allowed) {
      alert('本系統僅開放非假日當天以及前【' + this.beforeDates + '】天、後【' + this.afterDates + '】天可以點名，目前所選日期非在允許時段。');
      return;
    }


    this.students.forEach((s) => {
      let tmpDetail: string = '';

      s.leaveList.forEach((value, key) => {
        let periodName = s.leaveList.get(key).periodName;
        let periodType = this.periodMap.get(periodName).type;
        let periodSortOrder = this.periodMap.get(periodName).sort;
        let absName = s.leaveList.get(key).absName;

        if (s.orileaveList.get(periodName) != null) {
          if (s.leaveList.get(periodName).absName != s.orileaveList.get(periodName).absName) {
            s.warnCheckList.push(absName + "_" + periodSortOrder);
          }
        }
        else {
          s.warnCheckList.push(absName + "_" + periodSortOrder);
        }

        tmpDetail += `<Period AbsenceType="${absName}" AttendanceType="${periodType}">${periodName}</Period>`;
      });

      data.push({
        sid: s.sid,
        detail: (tmpDetail) ? `<Attendance>${tmpDetail}</Attendance>` : ''
      });

      // 連堂重覆缺曠處理
      this.checkAbsences.forEach(Absence => {
        s.warnCheckList.forEach(element => {
          let n = parseInt(element.slice(- 1));
          if (s.warnCheckList.includes(Absence.name + "_" + (n + 1))) {

            if (!warnStudents.includes(s.name)) {
              warnStudents.push(s.name);
            }
            hasWarnData = true;
          }
        });
      });


      // 連堂重覆缺曠處理
      // s.warnCheckList.forEach(element => {
      //   let n = parseInt(element.slice(- 1));
      //   if (s.warnCheckList.includes("遲到" + "_" + (n + 1))) {

      //     if (!warnStudents.includes(s.name)) {
      //       warnStudents.push(s.name);
      //     }
      //     hasWarnData = true;
      //   }
      // });

    });

    warnMsg += warnStudents.join(",");

    if (hasWarnData) {
      // alert(warnMsg);
      // 確認後才儲存
      if (confirm(warnMsg)) {
        this.appService.saveStudentLeave(this.selClass, this.getDateString(this.currentDate), data).subscribe(() => {
          // 重取缺曠狀態
          this.toggleClassDate();
        });
      }
    } else {
      this.appService.saveStudentLeave(this.selClass, this.getDateString(this.currentDate), data).subscribe(() => {
        // 重取缺曠狀態
        this.toggleClassDate();
      });
    }



  }

}

